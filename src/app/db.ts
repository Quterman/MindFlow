import "server-only";
import Database from "better-sqlite3";
import path from "node:path";

type ReflectionRow = {
  id: string;
  entry_date: string;
  raw_text: string;
  transcript: string;
  summary: string;
  themes: string;
  insights: string;
  todos: string;
  completed_todos: string;
  repeats: string;
  created_at: string;
  updated_at: string;
};

export type Reflection = {
  id: string;
  entryDate: string;
  rawText: string;
  transcript: string;
  summary: string;
  themes: string[];
  insights: string[];
  todos: string[];
  completedTodos: string[];
  repeats: Array<{
    title: string;
    description: string;
    previousDate: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

const dbPath = path.join(process.cwd(), "reflection-diary.sqlite");

const seedEntries = [
  {
    entryDate: "2026-07-08",
    rawText:
      "Сегодня снова думал про запуск проекта. Я хочу сделать первый экран, но всё время откладываю. Кажется, я не до конца понимаю, с чего начать, и поэтому переключаюсь на мелкие дела.",
  },
  {
    entryDate: "2026-07-09",
    rawText:
      "После прогулки понял, что устал держать всё в голове. Нужно собрать мысли по дневнику и не пытаться сразу сделать идеальный продукт. Главное — проверить, помогает ли он вытаскивать инсайты.",
  },
  {
    entryDate: "2026-07-11",
    rawText:
      "Опять возвращаюсь к запуску проекта и снова переношу первый шаг. Похоже, дело не в задаче, а в неопределённости: я не понимаю, какой маленький шаг будет достаточно безопасным.",
  },
];

let db: DatabaseLike | null = null;

type DatabaseLike = Database.Database;

export function getDatabase() {
  if (db) {
    return db;
  }

  db = new Database(dbPath);
  ensureSchema(db);

  const countRow = db.prepare("SELECT COUNT(*) as count FROM reflections").get() as {
    count: number;
  };

  if (countRow.count === 0) {
    for (const seed of seedEntries) {
      insertReflection(seed.rawText, seed.entryDate);
    }
  }

  return db;
}

export function listReflections(): Reflection[] {
  const database = getDatabase();
  const rows = database
    .prepare("SELECT * FROM reflections ORDER BY entry_date DESC, created_at DESC")
    .all() as ReflectionRow[];

  return rows.map(rowToReflection);
}

export function createReflection(input: { rawText: string; entryDate?: string }) {
  return insertReflection(input.rawText, input.entryDate);
}

export function updateReflection(input: {
  id: string;
  rawText: string;
  entryDate?: string;
  summary?: string;
}) {
  const database = getDatabase();
  const existing = database
    .prepare("SELECT * FROM reflections WHERE id = ?")
    .get(input.id) as ReflectionRow | undefined;

  if (!existing) {
    return null;
  }

  if (input.summary !== undefined) {
    const now = new Date().toISOString();

    database
      .prepare(
        `UPDATE reflections
         SET summary = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.summary, now, input.id);

    const row = database
      .prepare("SELECT * FROM reflections WHERE id = ?")
      .get(input.id) as ReflectionRow;

    return rowToReflection(row);
  }

  const nextDate = input.entryDate || existing.entry_date;
  const previous = listReflections().filter(
    (item) => item.id !== input.id && item.entryDate < nextDate,
  );
  const analysis = analyzeReflection(input.rawText, previous, nextDate);
  const completedTodos = safeJson<string[]>(existing.completed_todos, []).filter(
    (todo) => analysis.todos.includes(todo),
  );
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE reflections
       SET entry_date = ?, raw_text = ?, transcript = ?, summary = ?,
           themes = ?, insights = ?, todos = ?, completed_todos = ?,
           repeats = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      nextDate,
      input.rawText,
      input.rawText,
      analysis.summary,
      JSON.stringify(analysis.themes),
      JSON.stringify(analysis.insights),
      JSON.stringify(analysis.todos),
      JSON.stringify(completedTodos),
      JSON.stringify(analysis.repeats),
      now,
      input.id,
    );

  const row = database
    .prepare("SELECT * FROM reflections WHERE id = ?")
    .get(input.id) as ReflectionRow;

  return rowToReflection(row);
}

export function deleteReflection(id: string) {
  const database = getDatabase();
  database.prepare("DELETE FROM reflections WHERE id = ?").run(id);
}

export function updateCompletedTodos(id: string, completedTodos: string[]) {
  const database = getDatabase();
  const existing = database
    .prepare("SELECT * FROM reflections WHERE id = ?")
    .get(id) as ReflectionRow | undefined;

  if (!existing) {
    return { status: "not-found" as const };
  }

  const todos = safeJson<string[]>(existing.todos, []);
  if (completedTodos.some((todo) => !todos.includes(todo))) {
    return { status: "invalid-todo" as const };
  }

  const normalizedCompletedTodos = todos.filter((todo) =>
    completedTodos.includes(todo),
  );
  const storedCompletedTodos = new Set(
    safeJson<string[]>(existing.completed_todos, []),
  );
  const currentCompletedTodos = todos.filter((todo) =>
    storedCompletedTodos.has(todo),
  );

  if (
    normalizedCompletedTodos.length === currentCompletedTodos.length &&
    normalizedCompletedTodos.every(
      (todo, index) => todo === currentCompletedTodos[index],
    )
  ) {
    return {
      status: "updated" as const,
      reflection: rowToReflection(existing),
    };
  }

  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE reflections
       SET completed_todos = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(normalizedCompletedTodos), now, id);

  const row = database
    .prepare("SELECT * FROM reflections WHERE id = ?")
    .get(id) as ReflectionRow;

  return {
    status: "updated" as const,
    reflection: rowToReflection(row),
  };
}

function insertReflection(rawText: string, entryDate = today()) {
  const database = getDatabaseWithoutSeed();
  const id = crypto.randomUUID();
  const previous = database
    .prepare("SELECT * FROM reflections ORDER BY entry_date DESC, created_at DESC")
    .all() as ReflectionRow[];
  const analysis = analyzeReflection(
    rawText,
    previous.map(rowToReflection).filter((item) => item.entryDate < entryDate),
    entryDate,
  );
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO reflections
       (id, entry_date, raw_text, transcript, summary, themes, insights, todos, repeats, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      entryDate,
      rawText,
      rawText,
      analysis.summary,
      JSON.stringify(analysis.themes),
      JSON.stringify(analysis.insights),
      JSON.stringify(analysis.todos),
      JSON.stringify(analysis.repeats),
      now,
      now,
    );

  const row = database
    .prepare("SELECT * FROM reflections WHERE id = ?")
    .get(id) as ReflectionRow;

  return rowToReflection(row);
}

function getDatabaseWithoutSeed() {
  if (!db) {
    db = new Database(dbPath);
    ensureSchema(db);
  }

  return db;
}

function ensureSchema(database: DatabaseLike) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY,
      entry_date TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      transcript TEXT NOT NULL,
      summary TEXT NOT NULL,
      themes TEXT NOT NULL,
      insights TEXT NOT NULL,
      todos TEXT NOT NULL,
      completed_todos TEXT NOT NULL DEFAULT '[]',
      repeats TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const columns = database
    .prepare("PRAGMA table_info(reflections)")
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === "completed_todos")) {
    database.exec(
      "ALTER TABLE reflections ADD COLUMN completed_todos TEXT NOT NULL DEFAULT '[]'",
    );
  }
}

function analyzeReflection(
  rawText: string,
  previous: Reflection[],
  entryDate: string,
) {
  const normalized = rawText.toLowerCase();
  const sentences = splitSentences(rawText);
  const themes = detectThemes(normalized);
  const patterns = detectPatterns(normalized);
  const previousDays = previous.filter((item) => item.entryDate < entryDate);
  const repeats = patterns.flatMap((pattern) => {
    const matchingDates = Array.from(
      new Set(
        previousDays
          .filter((item) => item.rawText.toLowerCase().match(pattern.matcher))
          .map((item) => item.entryDate),
      ),
    ).sort();

    if (matchingDates.length === 0) {
      return [];
    }

    return [
      {
        title: pattern.title,
        description: pattern.repeatDescription,
        previousDate: matchingDates[matchingDates.length - 1],
      },
    ];
  });
  const todos = detectTodos(sentences, patterns);
  const summary =
    sentences.slice(0, 2).join(" ") ||
    "Запись сохранена. Текста пока мало, чтобы сделать подробное summary.";
  const insights = buildInsights({ themes, patterns, repeats, todos });

  return {
    summary,
    themes,
    insights,
    todos,
    repeats,
  };
}

function buildInsights(input: {
  themes: string[];
  patterns: Array<{ title: string }>;
  repeats: Array<{ title: string; previousDate: string }>;
  todos: string[];
}) {
  const insights: string[] = [];

  if (input.repeats.length > 0) {
    insights.push(
      `Повторяется тема “${input.repeats[0].title}”. Она уже появлялась ${formatDate(input.repeats[0].previousDate)} — это стоит вынести из фона и разобрать отдельно.`,
    );
  }

  if (input.patterns.some((pattern) => pattern.title.includes("откладывание"))) {
    insights.push(
      "В записи заметен стопор перед первым шагом: движение по задаче важно, но старт снова переносится.",
    );
  }

  if (input.themes.includes("Усталость и перегруз")) {
    insights.push(
      "Усталость звучит как фактор, который влияет на решения. Важно отделить реальную нехватку ресурса от избегания неопределённости.",
    );
  }

  if (input.todos.length === 0) {
    insights.push(
      "Конкретных шагов к действию в этой записи не найдено — сейчас её ценность скорее в фиксации состояния и темы.",
    );
  }

  if (insights.length === 0) {
    insights.push(
      "Запись помогает зафиксировать текущий фокус. Если тема появится снова, дневник подсветит её как повтор.",
    );
  }

  return insights;
}

function detectThemes(text: string) {
  const themes = [
    {
      name: "Работа и проекты",
      words: ["проект", "работ", "задач", "запуск", "лендинг", "mvp"],
    },
    {
      name: "Усталость и перегруз",
      words: ["устал", "перегруз", "выгор", "сил", "ресурс"],
    },
    {
      name: "Неопределённость",
      words: ["не понимаю", "непонят", "неопредел", "сомнева", "страш"],
    },
    {
      name: "Отношения и разговоры",
      words: ["партн", "отнош", "разговор", "обсуд", "саша"],
    },
    {
      name: "Следующий шаг",
      words: ["надо", "нужно", "сделать", "написать", "завтра", "шаг"],
    },
  ]
    .filter((theme) => theme.words.some((word) => text.includes(word)))
    .map((theme) => theme.name);

  return themes.length > 0 ? themes : ["Личная рефлексия"];
}

function detectPatterns(text: string) {
  return [
    {
      title: "откладывание первого шага",
      matcher: /(отклады|перенош|не могу начать|первый шаг|старт|запуск)/,
      repeatDescription:
        "Похоже, повторяется не сама задача, а стопор перед стартом.",
    },
    {
      title: "избегание важного разговора",
      matcher: /(не могу обсудить|избега.*разговор|сложн.*разговор|партнер)/,
      repeatDescription:
        "Возвращается тема разговора, который пока не переходит в действие.",
    },
    {
      title: "перегруз и усталость",
      matcher: /(устал|нет сил|перегруз|выгор)/,
      repeatDescription:
        "Усталость повторяется как фактор, который влияет на решения.",
    },
  ].filter((pattern) => text.match(pattern.matcher));
}

function detectTodos(
  sentences: string[],
  patterns: Array<{ title: string }>,
) {
  const explicitTodos = sentences
    .flatMap((sentence) => extractActionsFromSentence(sentence))
    .map(normalizeTodo)
    .filter(Boolean);
  const inferredTodos: string[] = [];

  if (
    patterns.some((pattern) => pattern.title === "откладывание первого шага") &&
    !explicitTodos.some((todo) => todo.toLowerCase().includes("перв"))
  ) {
    inferredTodos.push("Определить один маленький первый шаг по проекту");
  }

  if (
    sentences.some((sentence) => /(доведу|довести).{0,80}(состояни|результат|конца)/i.test(sentence)) &&
    !explicitTodos.some((todo) => todo.toLowerCase().includes("довести"))
  ) {
    inferredTodos.push("Довести текущий тест до понятного рабочего состояния");
  }

  if (
    patterns.some((pattern) => pattern.title === "избегание важного разговора") &&
    !explicitTodos.some((todo) => todo.toLowerCase().includes("разговор"))
  ) {
    inferredTodos.push("Сформулировать тему разговора одним конкретным вопросом");
  }

  return Array.from(new Set([...explicitTodos, ...inferredTodos])).slice(0, 4);
}

function extractActionsFromSentence(sentence: string) {
  const normalized = sentence.trim();

  if (/(надо было|нужно было|стоило было|приходилось)/i.test(normalized)) {
    return [];
  }

  const explicitMatches = normalized.match(
    /(?:надо|нужно|стоит|важно|завтра|сегодня|давай)\s+(?!было)([^.!?;]+)/gi,
  );

  if (explicitMatches) {
    return explicitMatches;
  }

  if (/(сделать|написать|создать|проверить|собрать|выделить|обсудить|начать)/i.test(normalized)) {
    return [normalized];
  }

  return [];
}

function normalizeTodo(todo: string) {
  const normalized = todo
    .replace(/^(надо|нужно|стоит|важно|завтра|сегодня|давай|хочу)\s+/i, "")
    .replace(/\b(надо|нужно|стоило)\s+было\b.+$/i, "")
    .replace(/^(бы|быстро|просто)\s+/i, "")
    .replace(/\s+(потому что|из-за чего|вот|как мне кажется)\b.+$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[,.]$/g, "")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());

  if (normalized.length < 6 || normalized.length > 160) {
    return "";
  }

  return normalized;
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function rowToReflection(row: ReflectionRow): Reflection {
  const todos = safeJson<string[]>(row.todos, []);
  const storedCompletedTodos = new Set(
    safeJson<string[]>(row.completed_todos, []),
  );
  const completedTodos = todos.filter((todo) => storedCompletedTodos.has(todo));

  return {
    id: row.id,
    entryDate: row.entry_date,
    rawText: row.raw_text,
    transcript: row.transcript,
    summary: row.summary,
    themes: safeJson(row.themes, []),
    insights: safeJson(row.insights, []),
    todos,
    completedTodos,
    repeats: safeJson(row.repeats, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
}
