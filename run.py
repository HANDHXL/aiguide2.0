"""PyInstaller entry point — starts the AI Tour Guide server."""
import uvicorn
from backend.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
