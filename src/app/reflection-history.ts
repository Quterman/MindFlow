export type DaySummaryReflection = {
  summary: string;
  themes: string[];
  insights: string[];
  todos: string[];
  completedTodos: string[];
};

export type DayActionReflection = {
  id: string;
  entryDate: string;
  createdAt: string;
  todos: string[];
  completedTodos: string[];
};

export type GroupedDayAction = {
  todo: string;
  sources: Array<{
    reflectionId: string;
    entryDate: string;
    createdAt: string;
    todo: string;
    completed: boolean;
  }>;
};

export type OverviewReflection = DaySummaryReflection &
  DayActionReflection & {
    repeats: Array<{
      title: string;
      description: string;
      previousDate: string;
    }>;
  };

export type OverviewPattern = {
  title: string;
  description: string;
  dates: string[];
  latestDate: string;
};

export type OverviewLeadStory = {
  pattern: OverviewPattern;
  action: GroupedDayAction | null;
};

export type OverviewSnapshot = {
  latestEntryDate: string | null;
  daysSinceLatestEntry: number | null;
  isStale: boolean;
  leadStory: OverviewLeadStory | null;
  primaryInsights: Array<{
    text: string;
    entryDate: string;
  }>;
  openActions: GroupedDayAction[];
  patterns: OverviewPattern[];
  week: {
    entries: number;
    activeDays: number;
    actions: number;
    completedActions: number;
  };
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
  limit = Number.POSITIVE_INFINITY,
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

export function buildImportantEntryInsights(
  entry: Pick<OverviewReflection, "insights" | "repeats">,
) {
  const candidates = buildPrimaryInsights(
    [{ insights: entry.insights }],
    Math.max(entry.insights.length, 1),
  ).filter(
    (insight) => !isGenericInsight(insight) && scoreInsight(insight) >= 3.5,
  );
  const representedPatterns = new Set<number>();

  return candidates.filter((insight) => {
    const relatedPatternIndex = entry.repeats.findIndex((repeat) =>
      isInsightRelatedToPattern(insight, repeat),
    );
    if (relatedPatternIndex < 0) {
      return true;
    }
    if (representedPatterns.has(relatedPatternIndex)) {
      return false;
    }
    representedPatterns.add(relatedPatternIndex);
    return true;
  });
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
        entryDate: entry.entryDate,
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

export function buildOverviewSnapshot(
  entries: OverviewReflection[],
  currentDate: string,
): OverviewSnapshot {
  const availableEntries = entries.filter(
    (entry) => entry.entryDate <= currentDate,
  );
  const todayEntries = availableEntries.filter(
    (entry) => entry.entryDate === currentDate,
  );
  const insightEntries =
    todayEntries.length > 0 ? todayEntries : availableEntries;
  const primaryInsightTexts = buildPrimaryInsights(insightEntries, 3);
  const primaryInsights = primaryInsightTexts.flatMap((text) => {
    const source = insightEntries.find((entry) =>
      entry.insights.some(
        (insight) => normalizeText(insight) === normalizeText(text),
      ),
    );

    return source ? [{ text, entryDate: source.entryDate }] : [];
  });
  const openActions = groupDayActions(availableEntries)
    .filter((action) => !action.sources.every((source) => source.completed))
    .slice(0, 5);
  const patterns = buildOverviewPatterns(availableEntries).slice(0, 3);
  const leadPattern = patterns[0] || null;
  const leadAction = leadPattern
    ? openActions.find((action) =>
        action.sources.some(
          (source) => source.entryDate === leadPattern.latestDate,
        ),
      ) || null
    : null;
  const leadStory = leadPattern
    ? {
        pattern: leadPattern,
        action: leadAction,
      }
    : null;
  const latestEntryDate =
    availableEntries.reduce<string | null>(
      (latest, entry) =>
        !latest || entry.entryDate > latest ? entry.entryDate : latest,
      null,
    );
  const daysSinceLatestEntry = latestEntryDate
    ? differenceInCalendarDays(currentDate, latestEntryDate)
    : null;
  const weekStart = shiftDate(currentDate, -6);
  const weekEntries = availableEntries.filter(
    (entry) => entry.entryDate >= weekStart && entry.entryDate <= currentDate,
  );
  const weekActions = groupDayActions(weekEntries);

  return {
    latestEntryDate,
    daysSinceLatestEntry,
    isStale: daysSinceLatestEntry !== null && daysSinceLatestEntry >= 7,
    leadStory,
    primaryInsights: primaryInsights.filter(
      (insight) =>
        (!leadPattern ||
          !isInsightRelatedToPattern(insight.text, leadPattern)),
    ),
    openActions: openActions.filter((action) => action !== leadAction),
    patterns: patterns.filter((pattern) => pattern !== leadPattern),
    week: {
      entries: weekEntries.length,
      activeDays: new Set(weekEntries.map((entry) => entry.entryDate)).size,
      actions: weekActions.length,
      completedActions: weekActions.filter((action) =>
        action.sources.every((source) => source.completed),
      ).length,
    },
  };
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

function buildOverviewPatterns(entries: OverviewReflection[]) {
  const patterns = new Map<string, OverviewPattern>();

  for (const entry of entries) {
    for (const repeat of entry.repeats) {
      const normalizedTitle = normalizeText(repeat.title);
      if (!normalizedTitle) {
        continue;
      }

      const current = patterns.get(normalizedTitle) || {
        title: repeat.title.trim(),
        description: repeat.description.trim(),
        dates: [],
        latestDate: entry.entryDate,
      };
      current.dates = Array.from(
        new Set([...current.dates, repeat.previousDate, entry.entryDate]),
      ).sort();

      if (entry.entryDate >= current.latestDate) {
        current.title = repeat.title.trim();
        current.description = repeat.description.trim();
        current.latestDate = entry.entryDate;
      }
      patterns.set(normalizedTitle, current);
    }
  }

  return [...patterns.values()]
    .sort(
      (left, right) =>
        right.latestDate.localeCompare(left.latestDate) ||
        right.dates.length - left.dates.length,
    );
}

function shiftDate(date: string, offset: number) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + offset);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function differenceInCalendarDays(laterDate: string, earlierDate: string) {
  const later = parseDateAsUtc(laterDate);
  const earlier = parseDateAsUtc(earlierDate);
  return Math.max(0, Math.round((later - earlier) / 86_400_000));
}

function parseDateAsUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
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

function isInsightRelatedToPattern(
  insight: string,
  pattern: Pick<OverviewPattern, "title" | "description">,
) {
  const patternStems = significantWordStems(
    `${pattern.title} ${pattern.description}`,
  );
  const insightStems = significantWordStems(insight);
  const sharedStems = [...insightStems].filter((stem) =>
    patternStems.has(stem),
  );
  return sharedStems.length >= 2;
}

function significantWordStems(value: string) {
  return new Set(
    normalizeText(value)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5)
      .map((word) => word.slice(0, 5)),
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
