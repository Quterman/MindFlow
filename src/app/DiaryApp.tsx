"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  buildCalendarDates,
  buildDaySummary,
  buildPrimaryInsights,
  groupDayActions,
  shiftMonth,
} from "./reflection-history";

type Reflection = {
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
  analysisSource: "ai" | "fallback" | "legacy";
  analysisModel: string | null;
  analysisVersion: string | null;
  analysisGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DiaryView = "capture" | "today" | "history";

type TodoError = {
  reflectionId: string;
  message: string;
};

type TodoTarget = {
  reflectionId: string;
  todo: string;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
    };
  }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function DiaryApp({
  initialReflections,
  userEmail,
}: {
  initialReflections: Reflection[];
  userEmail: string;
}) {
  const [reflections, setReflections] = useState<Reflection[]>(initialReflections);
  const [rawText, setRawText] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeView, setActiveView] = useState<DiaryView>("capture");
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(
    null,
  );
  const [savedReflectionId, setSavedReflectionId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [todoError, setTodoError] = useState<TodoError | null>(null);
  const [updatingTodoKey, setUpdatingTodoKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const topRef = useRef<HTMLDivElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!savedReflectionId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const heading = resultHeadingRef.current;
      if (!heading) {
        return;
      }

      heading.focus({ preventScroll: true });
      scrollDiaryElementIntoView(heading);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeView, savedReflectionId]);

  const groupedByDate = useMemo(() => {
    return reflections.reduce<Record<string, Reflection[]>>((acc, item) => {
      acc[item.entryDate] = acc[item.entryDate] || [];
      acc[item.entryDate].push(item);
      return acc;
    }, {});
  }, [reflections]);

  const todayReflections = groupedByDate[today()] || [];
  const latestReflection = reflections[0] || null;

  async function saveReflection() {
    if (isSaving || isRecording) {
      return;
    }

    const submittedText = rawText.trim();
    const submittedDate = entryDate || today();
    if (submittedText.length < 8) {
      setFieldError("Добавьте хотя бы одно осмысленное предложение.");
      textareaRef.current?.focus();
      return;
    }

    discardRecognitionSession();
    setEntryDate(submittedDate);
    setIsSaving(true);
    setMessage("");
    setFieldError("");

    try {
      const response = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: submittedText,
          entryDate: submittedDate,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        const error =
          data.error || "Не получилось сохранить запись. Попробуйте ещё раз.";
        setFieldError(error);
        textareaRef.current?.focus();
        return;
      }

      const data = (await response.json()) as { reflection: Reflection };
      setReflections((items) => [data.reflection, ...items]);
      setSavedReflectionId(data.reflection.id);
      if (data.reflection.entryDate === today()) {
        setActiveView("today");
        setSelectedHistoryDate(null);
      } else {
        setActiveView("history");
        setSelectedHistoryDate(data.reflection.entryDate);
      }
      setRawText("");
      setEntryDate(today());
      setTodoError(null);
      setMessage(
        data.reflection.analysisSource === "fallback"
          ? "AI-анализ временно недоступен. Запись сохранена с базовым разбором."
          : "",
      );
    } catch {
      setMessage(
        "Не получилось связаться с дневником. Запись не сохранена — попробуйте ещё раз.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteReflection(reflectionId: string) {
    if (isSaving) {
      setMessage("Дождитесь завершения разбора перед удалением записи.");
      return;
    }
    if (updatingTodoKey) {
      setMessage("Дождитесь сохранения действия перед удалением записи.");
      return;
    }

    const reflection = reflections.find((item) => item.id === reflectionId);
    if (!reflection) {
      return;
    }

    const shouldDelete = window.confirm("Удалить эту рефлексию?");
    if (!shouldDelete) {
      return;
    }

    try {
      const response = await fetch(`/api/reflections/${reflection.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Delete failed");
      }
    } catch {
      setMessage("Не получилось удалить запись. Попробуйте ещё раз.");
      return;
    }

    const nextReflections = reflections.filter((item) => item.id !== reflection.id);
    setReflections((items) =>
      items.filter((item) => item.id !== reflection.id),
    );
    if (savedReflectionId === reflection.id) {
      setSavedReflectionId(null);
    }
    const hasSelectedDay = nextReflections.some(
      (item) => item.entryDate === selectedHistoryDate,
    );
    if (selectedHistoryDate && !hasSelectedDay) {
      setSelectedHistoryDate(null);
    }
    setMessage("Запись удалена.");
  }

  function openCapture() {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setActiveView("capture");
    setSelectedHistoryDate(null);
    setSavedReflectionId(null);
    setFieldError("");
    setTodoError(null);
    setMessage("");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function addAnotherEntry() {
    discardRecognitionSession();
    openCapture();
  }

  function openHistoryDate(date: string) {
    if (isSaving) {
      return;
    }
    recognitionRef.current?.stop();
    setIsRecording(false);
    setActiveView("history");
    setSelectedHistoryDate(date);
    setSavedReflectionId(null);
    setTodoError(null);
    setMessage("");
    window.requestAnimationFrame(() => {
      scrollDiaryElementIntoView(topRef.current);
    });
  }

  function changeView(view: DiaryView) {
    if (isSaving) {
      return;
    }
    if (view !== "capture") {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }
    setActiveView(view);
    setSavedReflectionId(null);
    setTodoError(null);
    setMessage("");
    if (view !== "history") {
      setSelectedHistoryDate(null);
    }
    if (view === "capture") {
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      window.requestAnimationFrame(() => {
        scrollDiaryElementIntoView(topRef.current);
      });
    }
  }

  async function toggleTodos(targets: TodoTarget[], completed: boolean) {
    const uniqueTargets = Array.from(
      new Map(
        targets.map((target) => [
          `${target.reflectionId}:${target.todo}`,
          target,
        ]),
      ).values(),
    );
    const updates = uniqueTargets.flatMap((target) => {
      const reflection = reflections.find(
        (item) => item.id === target.reflectionId,
      );
      if (!reflection) {
        return [];
      }

      const completedTodos = completed
        ? Array.from(new Set([...reflection.completedTodos, target.todo]))
        : reflection.completedTodos.filter((item) => item !== target.todo);

      return [{ reflection, completedTodos }];
    });
    if (updates.length === 0 || updatingTodoKey) {
      return;
    }

    setUpdatingTodoKey(
      uniqueTargets
        .map((target) => `${target.reflectionId}:${target.todo}`)
        .join("|"),
    );
    setTodoError(null);

    const results = await Promise.allSettled(
      updates.map(async ({ reflection, completedTodos }) => {
        const response = await fetch(`/api/reflections/${reflection.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completedTodos }),
        });

        if (!response.ok) {
          throw new Error("Todo update failed");
        }

        return (await response.json()) as { reflection: Reflection };
      }),
    );
    const updatedReflections = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.reflection] : [],
    );

    if (updatedReflections.length > 0) {
      const updatedById = new Map(
        updatedReflections.map((reflection) => [reflection.id, reflection]),
      );
      setReflections((items) =>
        items.map((item) => updatedById.get(item.id) || item),
      );
    }

    if (results.some((result) => result.status === "rejected")) {
      setTodoError({
        reflectionId: updates[0].reflection.id,
        message:
          "Не удалось обновить действие во всех записях. Повторите попытку.",
      });
    }

    setUpdatingTodoKey(null);
  }

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!Recognition) {
      setMessage(
        "В этом браузере голосовое распознавание недоступно. Можно вставить текст вручную.",
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalText += `${result[0].transcript} `;
        }
      }

      if (finalText) {
        setRawText((current) => `${current} ${finalText}`.trim());
        setFieldError("");
      }
    };
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setIsRecording(false);
      setMessage(
        "Запись остановилась. Можно продолжить или дописать мысль вручную.",
      );
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setMessage("");
  }

  function discardRecognitionSession() {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognitionRef.current = null;
      try {
        recognition.stop();
      } catch {
        // The browser may already have ended this recognition session.
      }
    }
    setIsRecording(false);
  }

  return (
    <main className="min-h-screen bg-[#f6efe3] pb-[calc(7rem+env(safe-area-inset-bottom))] text-[#231b14] sm:pb-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(214,139,35,0.14),transparent_25rem),radial-gradient(circle_at_90%_10%,rgba(88,105,88,0.14),transparent_28rem)]" />

      <div
        className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6"
        ref={topRef}
      >
        <div className="flex items-center justify-between gap-3 px-1 text-sm text-[#6c5b4d]">
          <p className="min-w-0 truncate" title={userEmail}>
            <span className="font-black text-[#8b5a22]">MindFlow</span>
            <span aria-hidden="true"> · </span>
            <span>{userEmail}</span>
          </p>
          <form action="/auth/signout" method="post">
            <button
              className="shrink-0 rounded-full border border-[#3a2a1d]/10 px-3 py-2 font-bold text-[#7a4a1d] transition hover:bg-[#3a2a1d]/5"
              type="submit"
            >
              Выйти
            </button>
          </form>
        </div>

        <div className="hidden sm:block">
          <DiaryNavigation
            activeView={activeView}
            disabled={isSaving}
            onChange={changeView}
          />
        </div>

        {message && activeView !== "capture" && (
          <p
            aria-live="polite"
            className="rounded-2xl bg-[#efe0c8]/72 p-3 text-sm font-bold text-[#695744]"
          >
            {message}
          </p>
        )}

        {activeView === "capture" && (
          <CaptureView
            entryDate={entryDate}
            fieldError={fieldError}
            isRecording={isRecording}
            isSaving={isSaving}
            latestReflection={latestReflection}
            message={message}
            onChangeDate={setEntryDate}
            onChangeText={(nextText) => {
              setRawText(nextText);
              if (nextText.trim().length >= 8) {
                setFieldError("");
              }
            }}
            onClear={() => {
              setRawText("");
              setFieldError("");
            }}
            onOpenLatest={(reflection) => {
              if (reflection.entryDate === today()) {
                changeView("today");
              } else {
                openHistoryDate(reflection.entryDate);
              }
            }}
            onSave={saveReflection}
            onToggleRecording={toggleRecording}
            rawText={rawText}
            textareaRef={textareaRef}
          />
        )}

        {activeView === "today" && (
          <TodayView
            entries={todayReflections}
            onAddEntry={addAnotherEntry}
            onDelete={deleteReflection}
            onToggleTodos={toggleTodos}
            resultHeadingRef={resultHeadingRef}
            savedReflectionId={savedReflectionId}
            todoError={todoError}
            updatingTodoKey={updatingTodoKey}
          />
        )}

        {activeView === "history" && (
          <HistoryView
            groupedByDate={groupedByDate}
            onBack={() => {
              setSelectedHistoryDate(null);
              setSavedReflectionId(null);
              setTodoError(null);
            }}
            onDelete={deleteReflection}
            onOpenDate={openHistoryDate}
            onToggleTodos={toggleTodos}
            resultHeadingRef={resultHeadingRef}
            savedReflectionId={savedReflectionId}
            selectedDate={selectedHistoryDate}
            todoError={todoError}
            updatingTodoKey={updatingTodoKey}
          />
        )}
      </div>

      <div className="sm:hidden">
        <DiaryNavigation
          activeView={activeView}
          disabled={isSaving}
          mobile
          onChange={changeView}
        />
      </div>
    </main>
  );
}

function DiaryNavigation({
  activeView,
  disabled,
  mobile = false,
  onChange,
}: {
  activeView: DiaryView;
  disabled: boolean;
  mobile?: boolean;
  onChange: (view: DiaryView) => void;
}) {
  const items: Array<{ id: DiaryView; label: string }> = [
    { id: "capture", label: "Запись" },
    { id: "today", label: "Сегодня" },
    { id: "history", label: "История" },
  ];

  return (
    <nav
      aria-label="Разделы дневника"
      className={
        mobile
          ? "fixed inset-x-3 z-30 mx-auto max-w-md rounded-[1.5rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/95 p-2 shadow-[0_18px_50px_rgba(57,37,20,0.2)] backdrop-blur"
          : "sticky top-3 z-20 rounded-full border border-[#3a2a1d]/10 bg-[#fffaf1]/90 p-1.5 shadow-[0_12px_36px_rgba(57,37,20,0.08)] backdrop-blur"
      }
      style={
        mobile
          ? { bottom: "max(0.75rem, env(safe-area-inset-bottom))" }
          : undefined
      }
    >
      <div className="grid grid-cols-3 gap-1">
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`rounded-full px-3 py-3 text-sm font-black transition ${
                isActive
                  ? "bg-[#221a13] text-[#fff4df]"
                  : "text-[#6c5b4d] hover:bg-[#3a2a1d]/5"
              }`}
              key={item.id}
              disabled={disabled}
              onClick={() => onChange(item.id)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CaptureView({
  entryDate,
  fieldError,
  isRecording,
  isSaving,
  latestReflection,
  message,
  onChangeDate,
  onChangeText,
  onClear,
  onOpenLatest,
  onSave,
  onToggleRecording,
  rawText,
  textareaRef,
}: {
  entryDate: string;
  fieldError: string;
  isRecording: boolean;
  isSaving: boolean;
  latestReflection: Reflection | null;
  message: string;
  onChangeDate: (date: string) => void;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onOpenLatest: (reflection: Reflection) => void;
  onSave: () => void;
  onToggleRecording: () => void;
  rawText: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <>
      <header className="px-1 py-2">
        <p className="text-sm font-bold text-[#8b5a22]">{formatDate(entryDate)}</p>
        <h1 className="mt-2 font-serif-display text-4xl font-black leading-none tracking-[-0.06em] sm:text-5xl">
          Что сейчас крутится в голове?
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[#6c5b4d]">
          Запишите голосом или вставьте текст. Дневник соберёт итог, заметит
          важное и покажет, что возвращается снова.
        </p>
      </header>

      <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/86 p-5 shadow-[0_18px_55px_rgba(57,37,20,0.07)]">
        <div className="grid gap-3">
          <label className="text-sm font-bold text-[#8b5a22]" htmlFor="entry-date">
            День записи
          </label>
          <input
            className="w-full rounded-2xl border border-[#3a2a1d]/10 bg-white/72 px-4 py-3 text-[#3a2a1d] outline-none transition focus:border-[#a96214]"
            disabled={isSaving}
            id="entry-date"
            onChange={(event) => onChangeDate(event.target.value || today())}
            type="date"
            value={entryDate}
          />

          <label className="sr-only" htmlFor="reflection-text">
            Текст рефлексии
          </label>
          <textarea
            aria-describedby={fieldError ? "reflection-text-error" : undefined}
            aria-invalid={fieldError ? "true" : "false"}
            className={`min-h-40 w-full resize-y rounded-[1.5rem] border bg-white/72 p-4 leading-7 outline-none transition placeholder:text-[#7a6a5c]/42 ${
              fieldError
                ? "border-[#b6452c] focus:border-[#b6452c] focus:ring-2 focus:ring-[#b6452c]/20"
                : "border-[#3a2a1d]/10 focus:border-[#a96214]"
            }`}
            disabled={isSaving}
            id="reflection-text"
            maxLength={12_000}
            onChange={(event) => onChangeText(event.target.value)}
            placeholder={
              isRecording
                ? "Слушаю… говорите свободно, ваши мысли появятся здесь."
                : "Нажмите «Запись» и говорите — ваши мысли появятся здесь. Или напишите их вручную."
            }
            ref={textareaRef}
            value={rawText}
          />

          {fieldError && (
            <p
              className="rounded-2xl bg-[#f5d8cc] p-3 text-sm font-bold text-[#7f291d]"
              id="reflection-text-error"
              role="alert"
            >
              {fieldError}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              aria-label={isRecording ? "Остановить запись" : "Начать запись"}
              className={`inline-flex items-center justify-center gap-3 rounded-full px-5 py-3 font-black transition hover:-translate-y-0.5 ${
                isRecording
                  ? "bg-[#d66f2b] text-white shadow-[0_10px_28px_rgba(214,111,43,0.22)]"
                  : "bg-[#efe0c8] text-[#3a2a1d] hover:bg-[#ead6b8]"
              }`}
              disabled={isSaving}
              onClick={onToggleRecording}
              type="button"
            >
              <RecorderWave active={isRecording} />
              {isRecording ? "Слушаю" : "Запись"}
            </button>
            <button
              className="rounded-full bg-[#221a13] px-5 py-3 font-black text-[#fff4df] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || isRecording}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "Разбираю..." : "Разобрать запись"}
            </button>
            <button
              className="rounded-full border border-[#3a2a1d]/10 px-5 py-3 font-bold text-[#7a4a1d] transition hover:bg-[#3a2a1d]/5"
              disabled={isSaving}
              onClick={onClear}
              type="button"
            >
              Очистить
            </button>
          </div>
        </div>

        {message && (
          <p
            aria-live="polite"
            className="mt-4 rounded-2xl bg-[#efe0c8]/72 p-3 text-sm font-bold text-[#695744]"
          >
            {message}
          </p>
        )}
      </section>

      {latestReflection && (
        <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/74 p-5">
          <p className="text-sm font-black uppercase tracking-[0.12em] text-[#8b5a22]">
            Последняя запись
          </p>
          <p className="mt-2 font-bold leading-7">
            {latestReflection.summary || latestReflection.insights[0]}
          </p>
          <button
            className="mt-4 rounded-full border border-[#3a2a1d]/12 px-4 py-2 text-sm font-black text-[#7a4a1d] transition hover:bg-[#3a2a1d]/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            onClick={() => onOpenLatest(latestReflection)}
            type="button"
          >
            Открыть {latestReflection.entryDate === today() ? "сегодня" : "день"}
          </button>
        </section>
      )}
    </>
  );
}

function TodayView({
  entries,
  onAddEntry,
  onDelete,
  onToggleTodos,
  resultHeadingRef,
  savedReflectionId,
  todoError,
  updatingTodoKey,
}: {
  entries: Reflection[];
  onAddEntry: () => void;
  onDelete: (reflectionId: string) => void;
  onToggleTodos: (targets: TodoTarget[], completed: boolean) => void;
  resultHeadingRef: RefObject<HTMLHeadingElement | null>;
  savedReflectionId: string | null;
  todoError: TodoError | null;
  updatingTodoKey: string | null;
}) {
  const hasFreshResult = entries.some((item) => item.id === savedReflectionId);

  return (
    <>
      <header className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/86 p-5 shadow-[0_18px_55px_rgba(57,37,20,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#8b5a22]">
              {formatDate(today())}
            </p>
            <h1
              className="mt-2 scroll-mt-24 font-serif-display text-4xl font-black leading-none tracking-[-0.06em] outline-none focus-visible:ring-2 focus-visible:ring-[#a96214] focus-visible:ring-offset-4 sm:text-5xl"
              ref={hasFreshResult ? resultHeadingRef : undefined}
              tabIndex={hasFreshResult ? -1 : undefined}
            >
              Сегодня
            </h1>
            <p className="mt-3 max-w-xl leading-7 text-[#6c5b4d]">
              Все сегодняшние мысли, выводы и действия собраны в одном месте.
            </p>
            {hasFreshResult && (
              <p
                aria-live="polite"
                className="mt-3 inline-flex rounded-full bg-[#e1eadb] px-3 py-1.5 text-sm font-bold text-[#365234]"
              >
                Запись разобрана и сохранена
              </p>
            )}
          </div>
          <button
            className="rounded-full bg-[#221a13] px-5 py-3 font-black text-[#fff4df] transition hover:-translate-y-0.5"
            onClick={onAddEntry}
            type="button"
          >
            Добавить запись
          </button>
        </div>
      </header>

      {entries.length > 0 ? (
        <DayOverview
          entries={entries}
          onDelete={onDelete}
          onToggleTodos={onToggleTodos}
          todoError={todoError}
          updatingTodoKey={updatingTodoKey}
        />
      ) : (
        <EmptyDay />
      )}
    </>
  );
}

function HistoryView({
  groupedByDate,
  onBack,
  onDelete,
  onOpenDate,
  onToggleTodos,
  resultHeadingRef,
  savedReflectionId,
  selectedDate,
  todoError,
  updatingTodoKey,
}: {
  groupedByDate: Record<string, Reflection[]>;
  onBack: () => void;
  onDelete: (reflectionId: string) => void;
  onOpenDate: (date: string) => void;
  onToggleTodos: (targets: TodoTarget[], completed: boolean) => void;
  resultHeadingRef: RefObject<HTMLHeadingElement | null>;
  savedReflectionId: string | null;
  selectedDate: string | null;
  todoError: TodoError | null;
  updatingTodoKey: string | null;
}) {
  const historyDates = Object.keys(groupedByDate).sort((left, right) =>
    right.localeCompare(left),
  );
  const [visibleMonth, setVisibleMonth] = useState(
    (historyDates[0] || today()).slice(0, 7),
  );
  const selectedEntries =
    selectedDate !== null ? groupedByDate[selectedDate] || [] : [];
  const hasFreshResult = selectedEntries.some(
    (item) => item.id === savedReflectionId,
  );

  if (selectedDate === null) {
    return (
      <>
        <header className="px-1 py-2">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#8b5a22]">
            Архив по дням
          </p>
          <h1 className="mt-2 font-serif-display text-4xl font-black leading-none tracking-[-0.06em] sm:text-5xl">
            История
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-[#6c5b4d]">
            Выберите день — список сменится его разбором без формы новой записи.
          </p>
        </header>
        <CompactHistory
          groupedByDate={groupedByDate}
          onChangeMonth={setVisibleMonth}
          onSelect={onOpenDate}
          visibleMonth={visibleMonth}
        />
      </>
    );
  }

  return (
    <>
      <header className="rounded-[2rem] border border-[#3a2a1d]/8 bg-[#fffaf1]/70 px-5 py-5 shadow-[0_12px_38px_rgba(57,37,20,0.04)] sm:px-7">
        <button
          className="rounded-full border border-[#3a2a1d]/10 px-4 py-2 text-sm font-black text-[#7a4a1d] transition hover:bg-[#3a2a1d]/5"
          onClick={onBack}
          type="button"
        >
          ← Назад к дням
        </button>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-[#8b7868]">
          Сохранённый день
        </p>
        <h1
          className="mt-2 scroll-mt-24 font-serif-display text-4xl font-black leading-none tracking-[-0.055em] outline-none focus-visible:ring-2 focus-visible:ring-[#a96214] focus-visible:ring-offset-4 sm:text-[2.65rem]"
          ref={hasFreshResult ? resultHeadingRef : undefined}
          tabIndex={hasFreshResult ? -1 : undefined}
        >
          {formatDate(selectedDate)}
        </h1>
        {hasFreshResult && (
          <p
            aria-live="polite"
            className="mt-3 inline-flex rounded-full bg-[#e1eadb] px-3 py-1.5 text-sm font-bold text-[#365234]"
          >
            Запись разобрана и сохранена
          </p>
        )}
      </header>

      {selectedEntries.length > 0 ? (
        <DayOverview
          entries={selectedEntries}
          onDelete={onDelete}
          onToggleTodos={onToggleTodos}
          todoError={todoError}
          updatingTodoKey={updatingTodoKey}
        />
      ) : (
        <section className="rounded-[2rem] bg-[#fffaf1]/78 p-8 text-center text-[#6c5b4d]">
          В этом дне больше нет записей.
        </section>
      )}
    </>
  );
}

function DayOverview({
  entries,
  onDelete,
  onToggleTodos,
  todoError,
  updatingTodoKey,
}: {
  entries: Reflection[];
  onDelete: (reflectionId: string) => void;
  onToggleTodos: (targets: TodoTarget[], completed: boolean) => void;
  todoError: TodoError | null;
  updatingTodoKey: string | null;
}) {
  const primaryInsights = buildPrimaryInsights(entries);
  const actions = groupDayActions(entries);

  return (
    <section className="grid gap-8 rounded-[2rem] border border-[#3a2a1d]/8 bg-[#fffaf1]/72 px-5 py-6 shadow-[0_14px_42px_rgba(57,37,20,0.045)] sm:px-7 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3a2a1d]/8 pb-5">
        <p className="font-serif-display text-2xl font-black tracking-[-0.04em]">
          Итог дня
        </p>
        <p className="rounded-full bg-[#efe5d5] px-3 py-1.5 text-sm font-bold text-[#6c5b4d]">
          {entries.length} {pluralize(entries.length, "запись", "записи", "записей")}
        </p>
      </div>

      <section aria-labelledby="primary-insights-heading">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a96214]">
          Что стоит забрать с собой
        </p>
        <h2
          className="mt-2 font-serif-display text-3xl font-black tracking-[-0.05em]"
          id="primary-insights-heading"
        >
          Основные инсайты
        </h2>
        {primaryInsights.length > 0 ? (
          <ol className="mt-5 grid gap-3">
            {primaryInsights.map((insight, index) => (
              <li
                className="grid grid-cols-[auto_1fr] gap-3 border-b border-[#3a2a1d]/8 pb-4 leading-7 last:border-0 last:pb-0"
                key={insight}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-[#d58b22] text-xs font-black text-white"
                >
                  {index + 1}
                </span>
                <span>{insight}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 leading-7 text-[#6c5b4d]">
            Значимые инсайты пока не сформированы.
          </p>
        )}
      </section>

      <section
        aria-labelledby="day-actions-heading"
        className="rounded-3xl bg-[#e7ede2]/72 p-5"
      >
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#56704f]">
          Практический фокус
        </p>
        <h2
          className="mt-2 font-serif-display text-2xl font-black tracking-[-0.04em]"
          id="day-actions-heading"
        >
          Следующие шаги
        </h2>
        {actions.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {actions.map((action) => {
              const isCompleted = action.sources.every(
                (source) => source.completed,
              );
              const completedCount = action.sources.filter(
                (source) => source.completed,
              ).length;
              const targets = action.sources.map((source) => ({
                reflectionId: source.reflectionId,
                todo: source.todo,
              }));
              return (
                <li
                  className="rounded-2xl bg-white/70 px-4 py-3"
                  key={action.todo}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      aria-label={`${isCompleted ? "Отметить невыполненным" : "Отметить выполненным"}: ${action.todo}`}
                      checked={isCompleted}
                      className="mt-1 h-5 w-5 shrink-0 accent-[#56704f]"
                      disabled={updatingTodoKey !== null}
                      onChange={(event) =>
                        onToggleTodos(targets, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span
                        className={
                          isCompleted
                            ? "block leading-7 text-[#6c5b4d] line-through"
                            : "block leading-7"
                        }
                      >
                        {action.todo}
                      </span>
                      <span className="mt-1 block text-xs font-bold text-[#56704f]">
                        {action.sources.length > 1
                          ? `Из ${action.sources.length} записей · выполнено ${completedCount}`
                          : formatTime(action.sources[0].createdAt)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 leading-7 text-[#6c5b4d]">
            Конкретных шагов к действию в записях этого дня не найдено.
          </p>
        )}
        {todoError &&
          entries.some((entry) => entry.id === todoError.reflectionId) && (
            <p
              className="mt-3 rounded-xl bg-[#f5d8cc] p-3 text-sm font-bold text-[#7f291d]"
              role="alert"
            >
              {todoError.message}
            </p>
          )}
      </section>

      <section>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8b7868]">
          Контекст и детали
        </p>
        <h2 className="mt-2 font-serif-display text-2xl font-black tracking-[-0.04em]">
          Записи дня
        </h2>
        <div className="mt-4 divide-y divide-[#3a2a1d]/8 border-y border-[#3a2a1d]/8">
          {entries.map((reflection) => (
            <details
              className="group py-4"
              key={reflection.id}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[#8b5a22]">
                    {formatTime(reflection.createdAt)}
                  </span>
                  <span className="mt-1 line-clamp-2 block leading-6 text-[#6c5b4d]">
                    {reflection.summary || "Краткий итог не сформирован."}
                  </span>
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#efe5d5] text-xl leading-none transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-4 border-t border-[#3a2a1d]/8 pt-4">
                <div className="mb-4 flex justify-end">
                  <EntryActions
                    onDelete={() => onDelete(reflection.id)}
                    reflectionId={reflection.id}
                  />
                </div>
                <SessionDetails reflection={reflection} />
              </div>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}

function EntryActions({
  onDelete,
  reflectionId,
}: {
  onDelete: () => void;
  reflectionId: string;
}) {
  return (
    <details className="relative">
      <summary
        aria-label="Дополнительные действия с записью"
        className="cursor-pointer list-none rounded-full border border-[#3a2a1d]/10 px-4 py-2 text-xl font-black leading-none text-[#7a4a1d] hover:bg-[#3a2a1d]/5"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-2 min-w-44 rounded-2xl border border-[#3a2a1d]/10 bg-[#fffaf1] p-2 shadow-[0_16px_38px_rgba(34,26,19,0.18)]">
        <button
          aria-describedby={`delete-note-${reflectionId}`}
          className="w-full rounded-xl px-3 py-2 text-left text-sm font-black text-[#9b3525] hover:bg-[#f5d8cc]"
          onClick={onDelete}
          type="button"
        >
          Удалить запись
        </button>
        <span className="sr-only" id={`delete-note-${reflectionId}`}>
          Перед удалением появится подтверждение
        </span>
      </div>
    </details>
  );
}

function SessionDetails({ reflection }: { reflection: Reflection }) {
  return (
    <div className="grid gap-4">
      {reflection.repeats.length > 0 && (
        <section className="rounded-3xl border border-[#a96214]/20 bg-[#f3dfbd]/58 p-4">
          <h3 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-[#8b5a22]">
            Зона внимания
          </h3>
          <div className="grid gap-3">
            {reflection.repeats.map((repeat) => (
              <article
                className="rounded-2xl bg-white/58 p-4"
                key={`${repeat.title}-${repeat.previousDate}`}
              >
                <p className="font-black text-[#2d2219]">{repeat.title}</p>
                <p className="mt-1 leading-7 text-[#6c5b4d]">
                  {repeat.description}
                </p>
                <p className="mt-2 text-sm font-bold text-[#8b5a22]">
                  Похожее уже было {formatDateShort(repeat.previousDate)}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-[#8b5a22]">
          Темы записи
        </h3>
        <div className="flex flex-wrap gap-2">
          {reflection.themes.map((theme) => (
            <span
              className="rounded-full bg-[#ede0c9] px-3 py-2 text-sm font-bold text-[#4a3828]"
              key={theme}
            >
              {theme}
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-[#3a2a1d]/8 pt-4">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-[#8b5a22]">
          Исходная запись
        </h3>
        <div className="mt-3 whitespace-pre-wrap leading-7 text-[#3a2a1d] sm:max-h-80 sm:overflow-auto sm:pr-3">
          {reflection.rawText}
        </div>
      </section>
    </div>
  );
}

function EmptyDay() {
  return (
    <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/78 p-8 text-center shadow-[0_14px_46px_rgba(57,37,20,0.055)]">
      <p className="font-serif-display text-3xl font-black tracking-[-0.05em]">
        Сегодня пока тихо
      </p>
      <p className="mt-3 leading-7 text-[#6c5b4d]">
        Добавьте первую запись — здесь соберутся выводы и действия дня.
      </p>
    </section>
  );
}

function CompactHistory({
  groupedByDate,
  onChangeMonth,
  onSelect,
  visibleMonth,
}: {
  groupedByDate: Record<string, Reflection[]>;
  onChangeMonth: (month: string) => void;
  onSelect: (date: string) => void;
  visibleMonth: string;
}) {
  const days = Object.entries(groupedByDate).sort(([dateA], [dateB]) =>
    dateB.localeCompare(dateA),
  );
  const recentDays = days.slice(0, 6);

  return (
    <div className="grid gap-5">
      <HistoryCalendar
        groupedByDate={groupedByDate}
        onChangeMonth={onChangeMonth}
        onSelect={onSelect}
        visibleMonth={visibleMonth}
      />

      <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/78 p-5 shadow-[0_14px_46px_rgba(57,37,20,0.055)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif-display text-3xl font-black tracking-[-0.05em]">
              Последние дни
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6c5b4d]">
              Быстрый доступ к недавним итогам без выбора даты в календаре.
            </p>
          </div>
          <span className="rounded-full bg-[#efe0c8] px-3 py-2 text-sm font-bold text-[#7a4a1d]">
            {days.length} дн.
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {recentDays.map(([date, items]) => {
            const insightsCount = items.reduce(
              (sum, item) => sum + item.insights.length,
              0,
            );
            const repeatsCount = items.reduce(
              (sum, item) => sum + item.repeats.length,
              0,
            );
            const todosCount = items.reduce(
              (sum, item) => sum + item.todos.length,
              0,
            );
            const themes = Array.from(
              new Set(items.flatMap((item) => item.themes)),
            ).slice(0, 4);

            return (
              <button
                className="rounded-3xl border border-[#3a2a1d]/8 bg-white/58 p-4 text-left text-[#3a2a1d] transition hover:-translate-y-0.5 hover:bg-white"
                key={date}
                onClick={() => onSelect(date)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.12em] text-[#8b5a22]">
                      {formatDate(date)}
                    </p>
                    <p className="mt-2 line-clamp-2 text-base font-black leading-6">
                      {buildDaySummary(items)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#efe0c8] px-3 py-2 text-xs font-black">
                    Открыть день
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <span className="rounded-2xl bg-[#fffaf1] px-3 py-2">
                    <b>{insightsCount}</b>
                    <span className="block text-xs opacity-65">инсайта</span>
                  </span>
                  <span className="rounded-2xl bg-[#fffaf1] px-3 py-2">
                    <b>{repeatsCount}</b>
                    <span className="block text-xs opacity-65">зон</span>
                  </span>
                  <span className="rounded-2xl bg-[#fffaf1] px-3 py-2">
                    <b>{todosCount}</b>
                    <span className="block text-xs opacity-65">действий</span>
                  </span>
                </div>

                {themes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {themes.map((theme) => (
                      <span
                        className="rounded-full bg-[#ede0c9] px-3 py-1 text-xs font-bold text-[#4a3828]"
                        key={theme}
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          {recentDays.length === 0 && (
            <p className="rounded-3xl bg-white/58 p-5 text-center text-[#6c5b4d]">
              История появится после первой записи.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryCalendar({
  groupedByDate,
  onChangeMonth,
  onSelect,
  visibleMonth,
}: {
  groupedByDate: Record<string, Reflection[]>;
  onChangeMonth: (month: string) => void;
  onSelect: (date: string) => void;
  visibleMonth: string;
}) {
  const dates = buildCalendarDates(visibleMonth);
  const [year, month] = visibleMonth.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("ru", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
  const markedDays = dates.filter(
    (date): date is string => Boolean(date && groupedByDate[date]?.length),
  ).length;

  return (
    <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/86 p-4 shadow-[0_14px_46px_rgba(57,37,20,0.055)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          aria-label="Предыдущий месяц"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#3a2a1d]/10 bg-white/58 text-xl font-black text-[#7a4a1d] transition hover:bg-white"
          onClick={() => onChangeMonth(shiftMonth(visibleMonth, -1))}
          type="button"
        >
          ←
        </button>
        <div className="min-w-0 text-center">
          <p className="font-serif-display text-2xl font-black capitalize tracking-[-0.04em]">
            {monthLabel}
          </p>
          <p className="mt-1 text-xs font-bold text-[#6c5b4d]">
            {markedDays > 0
              ? `${markedDays} ${pluralize(markedDays, "день с записями", "дня с записями", "дней с записями")}`
              : "В этом месяце записей нет"}
          </p>
        </div>
        <button
          aria-label="Следующий месяц"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#3a2a1d]/10 bg-white/58 text-xl font-black text-[#7a4a1d] transition hover:bg-white"
          onClick={() => onChangeMonth(shiftMonth(visibleMonth, 1))}
          type="button"
        >
          →
        </button>
      </div>

      <div
        aria-label={`Календарь за ${monthLabel}`}
        className="mt-5 grid grid-cols-7 gap-1.5"
        role="grid"
      >
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((weekday) => (
          <span
            className="pb-1 text-center text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#8b7868]"
            key={weekday}
            role="columnheader"
          >
            {weekday}
          </span>
        ))}

        {dates.map((date, index) => {
          if (!date) {
            return (
              <span
                aria-hidden="true"
                className="aspect-square min-h-10"
                key={`empty-${index}`}
                role="gridcell"
              />
            );
          }

          const entriesCount = groupedByDate[date]?.length || 0;
          const dayNumber = Number(date.slice(-2));
          const isToday = date === today();

          return (
            <span className="aspect-square min-h-10" key={date} role="gridcell">
              {entriesCount > 0 ? (
                <button
                  aria-label={`${formatDate(date)}: ${entriesCount} ${pluralize(entriesCount, "запись", "записи", "записей")}`}
                  className={`relative grid h-full w-full place-items-center rounded-2xl bg-[#221a13] text-sm font-black text-[#fff4df] shadow-[0_7px_18px_rgba(34,26,19,0.14)] transition hover:-translate-y-0.5 hover:bg-[#3b2b1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a96214] focus-visible:ring-offset-2 ${
                    isToday ? "ring-2 ring-[#d58b22] ring-offset-2" : ""
                  }`}
                  onClick={() => onSelect(date)}
                  type="button"
                >
                  {dayNumber}
                  <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d58b22] px-1 text-[0.6rem] leading-none text-white">
                    {entriesCount}
                  </span>
                </button>
              ) : (
                <span
                  aria-label={formatDate(date)}
                  className={`grid h-full w-full place-items-center rounded-2xl text-sm font-bold text-[#8b7868] ${
                    isToday ? "bg-[#efe0c8] text-[#7a4a1d]" : ""
                  }`}
                >
                  {dayNumber}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function RecorderWave({ active }: { active: boolean }) {
  return (
    <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
      {[8, 14, 20, 12, 17].map((height, index) => (
        <span
          className={`block w-1 rounded-full ${
            active ? "animate-pulse bg-white" : "bg-[#8b5a22]"
          }`}
          key={`${height}-${index}`}
          style={{
            height,
            animationDelay: `${index * 90}ms`,
          }}
        />
      ))}
    </span>
  );
}

function today() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  const parsedDate = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Дата не указана";
  }
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function formatDateShort(date: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));
}

function formatTime(date: string) {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Время не указано";
  }
  return new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function scrollDiaryElementIntoView(element: Element | null) {
  if (!element) {
    return;
  }
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
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
