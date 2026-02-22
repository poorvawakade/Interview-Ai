import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database setup
const db = new Database("interview.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    domain TEXT,
    language TEXT,
    difficulty TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    question TEXT,
    answer TEXT,
    analysis TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

// Migration: Ensure difficulty column exists
try {
  db.prepare("SELECT difficulty FROM sessions LIMIT 1").get();
} catch (e) {
  console.log("Adding difficulty column to sessions table...");
  db.exec("ALTER TABLE sessions ADD COLUMN difficulty TEXT");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/sessions", (req, res) => {
    const { id, domain, language, difficulty } = req.body;
    const stmt = db.prepare("INSERT INTO sessions (id, domain, language, difficulty) VALUES (?, ?, ?, ?)");
    stmt.run(id, domain, language, difficulty);
    res.json({ success: true });
  });

  app.get("/api/sessions/:id", (req, res) => {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
    const feedback = db.prepare("SELECT * FROM feedback WHERE session_id = ? ORDER BY created_at DESC").all(req.params.id);
    res.json({ session, feedback });
  });

  app.post("/api/feedback", (req, res) => {
    const { session_id, question, answer, analysis } = req.body;
    const stmt = db.prepare("INSERT INTO feedback (session_id, question, answer, analysis) VALUES (?, ?, ?, ?)");
    stmt.run(session_id, question, answer, JSON.stringify(analysis));
    res.json({ success: true });
  });

  app.get("/api/history", (req, res) => {
    const history = db.prepare(`
      SELECT s.*, COUNT(f.id) as question_count 
      FROM sessions s 
      LEFT JOIN feedback f ON s.id = f.session_id 
      GROUP BY s.id 
      ORDER BY s.created_at DESC
    `).all();
    res.json(history);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
