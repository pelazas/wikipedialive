import json
import os
import uuid
import requests
from sseclient import SSEClient

# URL for the Wikimedia recent changes stream
STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange'
INGEST_URL = os.getenv("INGEST_URL", "http://worker:8787/ingest")

# Constraints
MIN_CHAR_CHANGE = 1000  # Only care if they changed significant text
WIKI_DB = 'enwiki'     # Focus on English Wikipedia for now (easier for AI)


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

    # 3. Must be the target language
    if event_data.get('wiki') != WIKI_DB:
        return False

    # 4. Significance Check (Length difference)
    # We use abs() because a massive deletion is also interesting!
    length_new = event_data.get('length', {}).get('new', 0)
    length_old = event_data.get('length', {}).get('old', 0)
    diff = abs(length_new - length_old)

    if diff < MIN_CHAR_CHANGE:
        return False

    return True


def process_stream():
    print(f"Listening to {STREAM_URL}...")

    # Connect to the stream
    response = requests.get(
        STREAM_URL,
        stream=True,
        headers={
            "Accept": "text/event-stream",
            "User-Agent": "wikipedialive-ingestion/0.1 (contact: local-dev)"
        },
    )
    response.raise_for_status()
    client = SSEClient(response)

    for msg in client.events():
        if not msg.data:
            continue

        try:
            event_data = json.loads(msg.data)

            if filter_event(event_data):
                # This is a CANDIDATE for our AI
                request_id = str(uuid.uuid4())
                payload = {
                    "request_id": request_id,
                    "title": event_data.get('title', ''),
                    "url": event_data.get('meta', {}).get('uri', ''),
                    "user": event_data.get('user', ''),
                    "comment": event_data.get('comment', ''),
                    "change_size": event_data.get('length', {}).get('new', 0)
                    - event_data.get('length', {}).get('old', 0),
                    "timestamp": event_data.get('timestamp')
                }

                # Send to local receiver (or Cloudflare Worker later)
                try:
                    response = requests.post(INGEST_URL, json=payload, timeout=10)
                    if response.ok:
                        try:
                            enriched = response.json()
                            print(f"[ENRICHED:{request_id}]", enriched)
                        except ValueError:
                            print(f"[ENRICHED:{request_id}] (non-JSON response)")
                    else:
                        print(f"[ENRICHED:{request_id}] Worker responded with {response.status_code}: {response.text}")
                except Exception as e:
                    print(f"[ENRICHED:{request_id}] Error sending to ingest endpoint: {e}")

                print(f"[CANDIDATE] {payload['title']} | Change: {payload['change_size']} chars")
                print(f"   > Comment: {payload['comment']}\n")

        except json.JSONDecodeError:
            pass
        except Exception as e:
            print(f"Error processing event: {e}")


if __name__ == "__main__":
    process_stream()
