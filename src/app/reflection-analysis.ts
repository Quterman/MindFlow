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

export function analyzeReflection(
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

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
}
