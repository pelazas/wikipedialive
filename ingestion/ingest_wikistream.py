import json
import os
import requests
from sseclient import SSEClient

# URL for the Wikimedia recent changes stream
STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange'
INGEST_URL = os.getenv("INGEST_URL", "http://localhost:8787/ingest")

# Constraints
MIN_CHAR_CHANGE = 500  # Only care if they changed significant text (per README)
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
                payload = {
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
                    requests.post(INGEST_URL, json=payload, timeout=5)
                except Exception as e:
                    print(f"Error sending to ingest endpoint: {e}")

                print(f"[CANDIDATE] {payload['title']} | Change: {payload['change_size']} chars")
                print(f"   > Comment: {payload['comment']}\n")

        except json.JSONDecodeError:
            pass
        except Exception as e:
            print(f"Error processing event: {e}")


if __name__ == "__main__":
    process_stream()
