from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()


@app.post("/ingest")
async def ingest(request: Request):
    payload = await request.json()
    print("[RECEIVED]", payload)
    return JSONResponse({"ok": True})


@app.get("/health")
async def health():
    return {"ok": True}
