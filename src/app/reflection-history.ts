export type DaySummaryReflection = {
  summary: string;
  themes: string[];
  insights: string[];
  todos: string[];
  completedTodos: string[];
};

export type DayActionReflection = {
  id: string;
  createdAt: string;
  todos: string[];
  completedTodos: string[];
};

export type GroupedDayAction = {
  todo: string;
  sources: Array<{
    reflectionId: string;
    createdAt: string;
    todo: string;
    completed: boolean;
  }>;
};

export function buildDaySummary(entries: DaySummaryReflection[]) {
  if (entries.length === 0) {
    return "В этот день записей пока нет.";
  }

  const rankedThemes = rankThemes(entries).slice(0, 3);
  const insights = uniqueStrings(entries.flatMap((entry) => entry.insights));
  const summaries = uniqueStrings(entries.map((entry) => entry.summary));
  const todosCount = entries.reduce(
    (total, entry) => total + entry.todos.length,
    0,
  );
  const completedTodosCount = entries.reduce(
    (total, entry) => total + entry.completedTodos.length,
    0,
  );
  const parts: string[] = [];

  if (entries.length === 1) {
    const mainText = summaries[0] || insights[0];
    if (mainText) {
      parts.push(mainText);
    }
  } else if (rankedThemes.length > 0) {
    parts.push(
      `В записях дня звучали темы: ${joinRussianList(rankedThemes)}.`,
    );

    if (insights[0]) {
      parts.push(`Ключевой вывод: ${trimSentence(insights[0], 220)}`);
    }
  } else {
    const mainTexts = summaries.slice(0, 2).map((summary) =>
      trimSentence(summary, 180),
    );
    if (mainTexts.length > 0) {
      parts.push(mainTexts.join(" "));
    }
  }

  if (todosCount > 0) {
    parts.push(
      `Из ${todosCount} ${pluralize(
        todosCount,
        "намеченного действия",
        "намеченных действий",
        "намеченных действий",
      )} выполнено ${completedTodosCount}.`,
    );
  }

  return parts.join(" ") || "Краткий итог дня пока не сформирован.";
}

export function buildPrimaryInsights(
  entries: Pick<DaySummaryReflection, "insights">[],
  limit = 3,
) {
  const candidates = uniqueStrings(
    entries.flatMap((entry) => entry.insights),
  ).map((text, index) => ({
    text,
    index,
    score: scoreInsight(text),
  }));
  const meaningful = candidates.filter(
    (candidate) => !isGenericInsight(candidate.text),
  );
  const ranked = (meaningful.length > 0 ? meaningful : candidates).sort(
    (left, right) => right.score - left.score || left.index - right.index,
  );

  return ranked.reduce<string[]>((selected, candidate) => {
    if (
      selected.length < limit &&
      !selected.some((current) => areSimilar(current, candidate.text))
    ) {
      selected.push(candidate.text);
    }
    return selected;
  }, []);
}

export function groupDayActions(entries: DayActionReflection[]) {
  const groups = new Map<
    string,
    GroupedDayAction & { firstIndex: number }
  >();
  let index = 0;

  for (const entry of entries) {
    for (const todo of entry.todos) {
      const normalized = normalizeText(todo);
      if (!normalized) {
        continue;
      }

      const current = groups.get(normalized) || {
        todo: todo.trim(),
        sources: [],
        firstIndex: index,
      };
      current.sources.push({
        reflectionId: entry.id,
        createdAt: entry.createdAt,
        todo,
        completed: entry.completedTodos.some(
          (completedTodo) => normalizeText(completedTodo) === normalized,
        ),
      });
      groups.set(normalized, current);
      index += 1;
    }
  }

  return [...groups.values()]
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map((group) => ({
      todo: group.todo,
      sources: group.sources,
    }));
}

export function buildCalendarDates(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return [];
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return [];
  }

  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: Array<string | null> = Array(firstWeekday).fill(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }

  while (dates.length < 42) {
    dates.push(null);
  }

  return dates;
}

export function shiftMonth(monthKey: string, offset: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return monthKey;
  }

  const shifted = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

function rankThemes(entries: DaySummaryReflection[]) {
  const counts = new Map<string, { count: number; firstIndex: number }>();
  let index = 0;

  for (const entry of entries) {
    for (const theme of uniqueStrings(entry.themes)) {
      const current = counts.get(theme);
      counts.set(theme, {
        count: (current?.count || 0) + 1,
        firstIndex: current?.firstIndex ?? index,
      });
      index += 1;
    }
  }

  return [...counts.entries()]
    .sort(
      ([, left], [, right]) =>
        right.count - left.count || left.firstIndex - right.firstIndex,
    )
    .map(([theme]) => theme);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru");
}

function scoreInsight(value: string) {
  const normalized = normalizeText(value);
  let score = Math.min(normalized.length, 240) / 120;

  if (/(повтор|снова|уже появ|возвращ)/.test(normalized)) {
    score += 5;
  }
  if (/(влияет|приводит|мешает|помогает|зависит|похоже)/.test(normalized)) {
    score += 2;
  }
  if (/(важно|стоит|нужно|отделить|разобрать|проверить)/.test(normalized)) {
    score += 2;
  }

  return score;
}

function isGenericInsight(value: string) {
  const normalized = normalizeText(value);

  return [
    "запись помогает зафиксировать",
    "ценность скорее в фиксации",
    "конкретных шагов к действию",
    "дневник подсветит её как повтор",
  ].some((fragment) => normalized.includes(fragment));
}

function areSimilar(left: string, right: string) {
  const leftWords = significantWords(left);
  const rightWords = significantWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) {
    return false;
  }

  const intersection = [...leftWords].filter((word) =>
    rightWords.has(word),
  ).length;
  const smallerSetSize = Math.min(leftWords.size, rightWords.size);

  return intersection / smallerSetSize >= 0.72;
}

function significantWords(value: string) {
  const stopWords = new Set([
    "автор",
    "важно",
    "запись",
    "который",
    "потому",
    "сейчас",
    "стоит",
    "этой",
    "этот",
  ]);

  return new Set(
    normalizeText(value)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5 && !stopWords.has(word)),
  );
}

function joinRussianList(values: string[]) {
  if (values.length < 2) {
    return values[0] || "";
  }

  return `${values.slice(0, -1).join(", ")} и ${values.at(-1)}`;
}

function trimSentence(value: string, maximumLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maximumLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maximumLength - 1).trimEnd()}…`;
}

function pluralize(
  value: number,
  one: string,
  few: string,
  many: string,
) {
  const modulo100 = value % 100;
  const modulo10 = value % 10;

  if (modulo100 >= 11 && modulo100 <= 14) {
    return many;
  }
  if (modulo10 === 1) {
    return one;
  }
  if (modulo10 >= 2 && modulo10 <= 4) {
    return few;
  }
  return many;
}
