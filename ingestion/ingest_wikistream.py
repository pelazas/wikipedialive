import json
import os
import time
import uuid
import requests
from sseclient import SSEClient

# URL for the Wikimedia recent changes stream
STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange'
INGEST_URL = os.getenv("INGEST_URL", "http://worker:8787/ingest")

# Constraints
MIN_CHAR_CHANGE = int(os.getenv("MIN_CHAR_CHANGE", "3000"))  # Only care if they changed significant text
LOG_EVERY_N = max(1, int(os.getenv("LOG_EVERY_N", "100")))
WIKI_DB = 'enwiki'     # Focus on English Wikipedia for now (easier for AI)
MAIN_NAMESPACE_ID = 0  # Only keep main/article namespace
NON_ARTICLE_PREFIXES = (
    "User:",
    "User talk:",
    "Talk:",
    "Template:",
    "Draft:",
    "Wikipedia:",
    "Category:",
    "File:",
    "MediaWiki:",
    "Help:",
    "Portal:",
    "Module:",
    "Book:",
    "TimedText:",
    "Education Program:",
    "Gadget:",
    "Gadget definition:",
)


def build_payload(event_data, request_id):
    """
    Build a payload that matches the worker ingress contract exactly.
    Returns None if required fields are missing or invalid.
    """
    title = event_data.get('title')
    url = event_data.get('meta', {}).get('uri')
    user = event_data.get('user')
    comment = event_data.get('comment', '')
    timestamp = event_data.get('timestamp')
    length_new = event_data.get('length', {}).get('new', 0)
    length_old = event_data.get('length', {}).get('old', 0)

    if not isinstance(title, str) or not title.strip():
        return None
    if not isinstance(url, str) or not url.strip():
        return None
    if not isinstance(user, str) or not user.strip():
        return None
    if not isinstance(comment, str):
        return None
    if not isinstance(timestamp, int) or timestamp <= 0:
        return None
    if not isinstance(length_new, int) or not isinstance(length_old, int):
        return None

    return {
        "request_id": request_id,
        "title": title,
        "url": url,
        "user": user,
        "comment": comment,
        "change_size": length_new - length_old,
        "timestamp": timestamp
    }


def filter_event(event_data):
    """
    Returns True if the event matches our 'Quality' criteria.
    """
    # 1. Must be a human (bot=False)
    if event_data.get('bot') is True:
        return False

    # 2. Must be an 'edit' or 'new' page (ignore logs/categories)
    if event_data.get('type') not in ['edit', 'new']:
        return False

    # 3. Skip minor edits
    if event_data.get('minor') is True:
        return False

    # 4. Must be the target language
    if event_data.get('wiki') != WIKI_DB:
        return False

    # 5. Only keep main/article namespace
    namespace = event_data.get('namespace', {})
    if isinstance(namespace, dict):
        ns_id = namespace.get('id')
    elif isinstance(namespace, int):
        ns_id = namespace
    else:
        ns_id = None

    if ns_id is not None and ns_id != MAIN_NAMESPACE_ID:
        return False

    title = event_data.get('title', '')
    if any(title.startswith(prefix) for prefix in NON_ARTICLE_PREFIXES):
        return False

    # 6. Significance Check (Length difference)
    # We use abs() because a massive deletion is also interesting!
    length_new = event_data.get('length', {}).get('new', 0)
    length_old = event_data.get('length', {}).get('old', 0)
    diff = abs(length_new - length_old)

    if diff < MIN_CHAR_CHANGE:
        return False

    return True


def log_summary(counters):
    print(
        "[SUMMARY] "
        f"seen={counters['seen']} "
        f"filtered={counters['filtered']} "
        f"enriched_ok={counters['enriched_ok']} "
        f"enriched_failed={counters['enriched_failed']} "
        f"db_insert_ok={counters['db_insert_ok']} "
        f"db_insert_failed={counters['db_insert_failed']}"
    )


def process_stream():
    print(f"Listening to {STREAM_URL}...")
    reconnect_delay_seconds = 2
    counters = {
        "seen": 0,
        "filtered": 0,
        "enriched_ok": 0,
        "enriched_failed": 0,
        "db_insert_ok": 0,
        "db_insert_failed": 0,
    }

    while True:
        stream_response = None
        try:
            # Connect to the stream
            stream_response = requests.get(
                STREAM_URL,
                stream=True,
                headers={
                    "Accept": "text/event-stream",
                    "User-Agent": "wikipedialive-ingestion/0.1 (contact: local-dev)"
                },
            )
            stream_response.raise_for_status()
            client = SSEClient(stream_response)

            for msg in client.events():
                if not msg.data:
                    continue
                counters["seen"] += 1

                try:
                    event_data = json.loads(msg.data)

                    if not filter_event(event_data):
                        counters["filtered"] += 1
                        if counters["seen"] % LOG_EVERY_N == 0:
                            log_summary(counters)
                        continue

                    # This is a CANDIDATE for our AI
                    request_id = str(uuid.uuid4())
                    payload = build_payload(event_data, request_id)
                    if payload is None:
                        counters["enriched_failed"] += 1
                        print(f"[ENRICHED:{request_id}] Skipping event due to payload contract mismatch")
                        if counters["seen"] % LOG_EVERY_N == 0:
                            log_summary(counters)
                        continue

                    # Send to local receiver (or Cloudflare Worker later)
                    try:
                        post_response = requests.post(INGEST_URL, json=payload, timeout=10)
                        if post_response.ok:
                            counters["enriched_ok"] += 1
                            db_inserted = None
                            try:
                                enriched = post_response.json()
                                db_inserted = enriched.get("db_inserted")
                                print(f"[ENRICHED:{request_id}]", enriched)
                            except ValueError:
                                print(f"[ENRICHED:{request_id}] (non-JSON response)")

                            if db_inserted is True:
                                counters["db_insert_ok"] += 1
                            elif db_inserted is False:
                                counters["db_insert_failed"] += 1
                        else:
                            counters["enriched_failed"] += 1
                            print(f"[ENRICHED:{request_id}] Worker responded with {post_response.status_code}: {post_response.text}")
                    except Exception as e:
                        counters["enriched_failed"] += 1
                        print(f"[ENRICHED:{request_id}] Error sending to ingest endpoint: {e}")

                    print(f"[CANDIDATE] {payload['title']} | Change: {payload['change_size']} chars")
                    print(f"   > Comment: {payload['comment']}\n")
                    if counters["seen"] % LOG_EVERY_N == 0:
                        log_summary(counters)

                except json.JSONDecodeError:
                    if counters["seen"] % LOG_EVERY_N == 0:
                        log_summary(counters)
                except Exception as e:
                    counters["enriched_failed"] += 1
                    print(f"Error processing event: {e}")
                    if counters["seen"] % LOG_EVERY_N == 0:
                        log_summary(counters)

        except requests.exceptions.RequestException as e:
            print(f"Stream connection error: {e}. Reconnecting in {reconnect_delay_seconds}s...")
            time.sleep(reconnect_delay_seconds)
        finally:
            if stream_response is not None:
                stream_response.close()


if __name__ == "__main__":
    process_stream()
