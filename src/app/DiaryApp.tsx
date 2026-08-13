"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  buildReflectionPreview,
  buildOverviewSourceSignature,
  buildOverviewStats,
  buildPrimaryInsights,
  getOverviewMaturity,
  groupDayActions,
  hasExternalObserverVoice,
  neutralizeExternalObserverVoice,
  OVERVIEW_ANALYSIS_LIMIT,
} from "./reflection-history";
import {
  buildTodoAppImportPayload,
  getPrimaryTodoSource,
} from "./todo-app-import";
import MindFlowMark from "./MindFlowMark";
import styles from "./DiaryApp.module.css";

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
  overview: {
    signals: Array<{
      kind:
        | "unfinished_intention"
        | "recurring_blocker"
        | "untested_hypothesis";
      title: string;
      finding: string;
      evidenceReflectionIds: string[];
      recommendation: string | null;
    }> | null;
    signalsSource: string | null;
    actionSupport: {
      action: string;
      rationale: string;
    } | null;
    suggestedAction: {
      action: string;
      rationale: string;
      sourceInsight: string;
      status: "pending" | "accepted" | "dismissed";
    } | null;
  } | null;
  analysisSource: "ai" | "fallback" | "legacy";
  analysisModel: string | null;
  analysisVersion: string | null;
  analysisGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DiaryView = "overview" | "capture" | "history";
type DayReturnView = DiaryView;

type TodoError = {
  reflectionId: string;
  message: string;
};

type TodoAppRequestState = Record<
  string,
  {
    status: "sending" | "sent" | "error";
    message: string;
  }
>;

type TodoTarget = {
  reflectionId: string;
  todo: string;
};

type OverviewRequest = {
  reflectionId: string;
  sourceSignature: string;
  status: "loading" | "error";
} | null;

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
  const [dayReturnView, setDayReturnView] =
    useState<DayReturnView>("history");
  const [savedReflectionId, setSavedReflectionId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [todoError, setTodoError] = useState<TodoError | null>(null);
  const [updatingTodoKey, setUpdatingTodoKey] = useState<string | null>(null);
  const [updatingSuggestionId, setUpdatingSuggestionId] = useState<
    string | null
  >(null);
  const [suggestionError, setSuggestionError] = useState<TodoError | null>(null);
  const [reanalyzingReflectionId, setReanalyzingReflectionId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState("");
  const [overviewRequest, setOverviewRequest] =
    useState<OverviewRequest>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const overviewRequestKeysRef = useRef(new Set<string>());

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
      setActiveView("history");
      setSelectedHistoryDate(data.reflection.entryDate);
      setDayReturnView("capture");
      setRawText("");
      setEntryDate(today());
      setTodoError(null);
      setOverviewRequest(null);
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

  const generateOverview = useCallback(async (
    reflectionId: string,
    sourceSignature: string,
  ) => {
    const requestKey = `${reflectionId}:${sourceSignature}`;
    if (overviewRequestKeysRef.current.has(requestKey)) {
      return;
    }
    overviewRequestKeysRef.current.add(requestKey);
    setOverviewRequest({
      reflectionId,
      sourceSignature,
      status: "loading",
    });

    try {
      const response = await fetch(
        `/api/reflections/${reflectionId}/overview`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("Overview generation failed");
      }

      const data = (await response.json()) as { reflection: Reflection };
      setReflections((items) => {
        const currentSourceSignature = buildOverviewSourceSignature(
          items.filter((item) => item.entryDate <= today()),
        );
        if (
          data.reflection.overview?.signalsSource !== currentSourceSignature
        ) {
          return items;
        }
        return items.map((item) =>
          item.id === data.reflection.id ? data.reflection : item,
        );
      });
      setOverviewRequest((current) =>
        current?.reflectionId === reflectionId &&
        current.sourceSignature === sourceSignature
          ? null
          : current,
      );
    } catch {
      overviewRequestKeysRef.current.delete(requestKey);
      setOverviewRequest((current) =>
        current?.reflectionId === reflectionId &&
        current.sourceSignature === sourceSignature
          ? {
              reflectionId,
              sourceSignature,
              status: "error",
            }
          : current,
      );
    }
  }, []);

  async function deleteReflection(reflectionId: string) {
    if (isSaving) {
      setMessage("Дождитесь завершения разбора перед удалением записи.");
      return;
    }
    if (updatingTodoKey) {
      setMessage("Дождитесь сохранения действия перед удалением записи.");
      return;
    }
    if (reanalyzingReflectionId) {
      setMessage("Дождитесь завершения повторного AI-анализа.");
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

  function openHistoryDate(
    date: string,
    returnView: DayReturnView = "history",
  ) {
    if (isSaving) {
      return;
    }
    recognitionRef.current?.stop();
    setIsRecording(false);
    setActiveView("history");
    setSelectedHistoryDate(date);
    setDayReturnView(returnView);
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
    } else {
      setSelectedHistoryDate(null);
      setDayReturnView("history");
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

  async function decideSuggestion(
    reflectionId: string,
    decision: "accepted" | "dismissed",
  ) {
    if (updatingSuggestionId) {
      return;
    }

    setUpdatingSuggestionId(reflectionId);
    setSuggestionError(null);
    try {
      const response = await fetch(`/api/reflections/${reflectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionDecision: decision }),
      });
      const data = (await response.json()) as {
        error?: string;
        reflection?: Reflection;
      };
      if (!response.ok || !data.reflection) {
        throw new Error(data.error || "Не получилось сохранить решение.");
      }

      setReflections((items) =>
        items.map((item) =>
          item.id === data.reflection?.id ? data.reflection : item,
        ),
      );
    } catch (error) {
      setSuggestionError({
        reflectionId,
        message:
          error instanceof Error
            ? error.message
            : "Не получилось сохранить решение. Попробуйте ещё раз.",
      });
    } finally {
      setUpdatingSuggestionId(null);
    }
  }

  async function retryReflectionAnalysis(reflectionId: string) {
    if (reanalyzingReflectionId || isSaving) {
      return;
    }

    setReanalyzingReflectionId(reflectionId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/reflections/${reflectionId}/reanalyze`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("Reanalysis failed");
      }

      const data = (await response.json()) as { reflection: Reflection };
      setReflections((items) =>
        items.map((item) =>
          item.id === data.reflection.id ? data.reflection : item,
        ),
      );
      setSavedReflectionId(data.reflection.id);
      setMessage(
        data.reflection.analysisSource === "ai"
          ? "AI-анализ обновлён."
          : "Модель снова не ответила вовремя. Базовый разбор сохранён.",
      );
    } catch {
      setMessage(
        "Не получилось повторить AI-анализ. Запись и текущий разбор сохранены.",
      );
    } finally {
      setReanalyzingReflectionId(null);
    }
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
    <main className={styles.appRoot}>
      <div className={styles.appShell} ref={topRef}>
        <aside className={styles.sidebar}>
          <MindFlowBrand />
          <DiaryNavigation
            activeView={activeView}
            disabled={isSaving}
            sidebar
            onChange={changeView}
          />

          <div className={styles.sidebarFooter}>
            <div className={styles.profile} title={userEmail}>
              <span className={styles.avatar} aria-hidden="true">
                {userEmail.slice(0, 1) || "M"}
              </span>
              <span className={styles.profileCopy}>
                <strong>{userEmail.split("@")[0] || "MindFlow"}</strong>
                <span>Личный дневник</span>
              </span>
            </div>
            <form action="/auth/signout" method="post">
              <button className={styles.signOutButton} type="submit">
                Выйти из аккаунта
              </button>
            </form>
          </div>
        </aside>

        <div className={styles.workspace}>
          <div className={styles.mobileHeader}>
            <MindFlowBrand />
            <form action="/auth/signout" method="post">
              <button className={styles.signOutButton} type="submit">
                Выйти
              </button>
            </form>
          </div>

          <div className={styles.contentFrame}>
            {message && activeView !== "capture" && (
              <p
                aria-live="polite"
                className="mb-5 rounded-2xl bg-[#efe0c8]/72 p-3 text-sm font-bold text-[#695744]"
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
                onSave={saveReflection}
                onToggleRecording={toggleRecording}
                rawText={rawText}
                textareaRef={textareaRef}
              />
            )}

            {activeView === "overview" && (
              <OverviewView
                entries={reflections}
                onGenerateOverview={generateOverview}
                onAddEntry={addAnotherEntry}
                onOpenHistory={() => changeView("history")}
                onOpenDate={(date) => openHistoryDate(date, "overview")}
                overviewRequest={overviewRequest}
              />
            )}

            {activeView === "history" && (
              <HistoryView
                groupedByDate={groupedByDate}
                onBack={() => {
                  if (dayReturnView === "history") {
                    setSelectedHistoryDate(null);
                    setSavedReflectionId(null);
                    setTodoError(null);
                    return;
                  }
                  changeView(dayReturnView);
                }}
                backLabel={
                  dayReturnView === "overview"
                    ? "Назад в обзор"
                    : dayReturnView === "capture"
                      ? "Назад к записи"
                      : "Назад к дням"
                }
                onDelete={deleteReflection}
                onOpenDate={(date) => openHistoryDate(date, "history")}
                onRetryAnalysis={retryReflectionAnalysis}
                onDecideSuggestion={decideSuggestion}
                onToggleTodos={toggleTodos}
                reanalyzingReflectionId={reanalyzingReflectionId}
                resultHeadingRef={resultHeadingRef}
                savedReflectionId={savedReflectionId}
                selectedDate={selectedHistoryDate}
                suggestionError={suggestionError}
                todoError={todoError}
                updatingSuggestionId={updatingSuggestionId}
                updatingTodoKey={updatingTodoKey}
              />
            )}
          </div>
        </div>
      </div>

      <div className={styles.mobileNavigation}>
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
  sidebar = false,
  onChange,
}: {
  activeView: DiaryView;
  disabled: boolean;
  mobile?: boolean;
  sidebar?: boolean;
  onChange: (view: DiaryView) => void;
}) {
  const items: Array<{
    id: DiaryView;
    icon: "capture" | "history" | "overview";
    label: string;
  }> = [
    { id: "capture", icon: "capture", label: "Запись" },
    { id: "history", icon: "history", label: "История" },
    { id: "overview", icon: "overview", label: "Обзор" },
  ];

  if (sidebar) {
    return (
      <nav aria-label="Разделы дневника" className={styles.sidebarNav}>
        {items.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`${styles.sidebarNavButton} ${
                isActive ? styles.sidebarNavButtonActive : ""
              }`}
              disabled={disabled}
              key={item.id}
              onClick={() => onChange(item.id)}
              type="button"
            >
              <DiaryIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

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
                  ? item.id === "capture"
                    ? "bg-[#d58b22] text-white shadow-[0_8px_20px_rgba(169,98,20,0.24)]"
                    : "bg-[#221a13] text-[#fff4df]"
                  : item.id === "capture"
                    ? "bg-[#d58b22] text-white shadow-[0_8px_20px_rgba(169,98,20,0.22)] hover:bg-[#bd741c]"
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
  message,
  onChangeDate,
  onChangeText,
  onClear,
  onSave,
  onToggleRecording,
  rawText,
  textareaRef,
}: {
  entryDate: string;
  fieldError: string;
  isRecording: boolean;
  isSaving: boolean;
  message: string;
  onChangeDate: (date: string) => void;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onSave: () => void;
  onToggleRecording: () => void;
  rawText: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className={styles.captureGrid}>
      <div className={styles.captureMain}>
        <header className={styles.captureHeader}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a96214]">
              {formatDate(entryDate)}
            </p>
            <h1 className="mt-3 max-w-3xl font-serif-display text-4xl font-black leading-none tracking-[-0.06em] sm:text-5xl xl:text-[3.65rem]">
              Что сейчас крутится в голове?
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#6c5b4d]">
              Можно говорить как есть. MindFlow соберёт итог, заметит важное и
              сохранит нить мысли.
            </p>
          </div>
        </header>

        <section className={styles.editorCard}>
          <div className={styles.editorTopline}>
            <label className={styles.editorLabel} htmlFor="reflection-text">
              Новая рефлексия
            </label>
            <label className={styles.editorDateLabel} htmlFor="entry-date">
              <span className="sr-only">День записи</span>
              <input
                className={styles.editorDateInput}
                disabled={isSaving}
                id="entry-date"
                onChange={(event) => onChangeDate(event.target.value || today())}
                type="date"
                value={entryDate}
              />
            </label>
          </div>

          <textarea
            aria-describedby={fieldError ? "reflection-text-error" : undefined}
            aria-invalid={fieldError ? "true" : "false"}
            className={styles.editorTextarea}
            disabled={isSaving}
            id="reflection-text"
            maxLength={12_000}
            onChange={(event) => onChangeText(event.target.value)}
            placeholder={
              isRecording
                ? "Слушаю… говорите свободно, ваши мысли появятся здесь."
                : "Начните говорить или запишите мысль вручную…"
            }
            ref={textareaRef}
            value={rawText}
          />

          {fieldError && (
            <p
              className="mx-4 mb-3 rounded-2xl bg-[#f5d8cc] p-3 text-sm font-bold text-[#7f291d]"
              id="reflection-text-error"
              role="alert"
            >
              {fieldError}
            </p>
          )}

          <div className={styles.editorFooter}>
            <button
              aria-label={isRecording ? "Остановить запись" : "Начать запись"}
              className={`inline-flex items-center justify-center gap-3 rounded-2xl px-4 py-3 font-black transition hover:-translate-y-0.5 ${
                isRecording
                  ? "bg-[#d66f2b] text-white shadow-[0_10px_28px_rgba(214,111,43,0.22)]"
                  : "border border-[#3a2a1d]/10 bg-white/75 text-[#3a2a1d] hover:bg-white"
              }`}
              disabled={isSaving}
              onClick={onToggleRecording}
              type="button"
            >
              <RecorderWave active={isRecording} />
              {isRecording ? "Слушаю" : "Начать запись"}
            </button>
            <button
              className="ml-auto rounded-2xl bg-[#221a13] px-5 py-3 font-black text-[#fff4df] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || isRecording}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "Разбираю..." : "Разобрать запись"}
            </button>
            <button
              aria-label="Очистить текст"
              className="rounded-2xl border border-[#3a2a1d]/10 px-4 py-3 font-bold text-[#7a4a1d] transition hover:bg-white/70"
              disabled={isSaving}
              onClick={onClear}
              type="button"
            >
              Очистить
            </button>
          </div>
        </section>

        {message && (
          <p
            aria-live="polite"
            className="mt-4 rounded-2xl bg-[#efe0c8]/72 p-3 text-sm font-bold text-[#695744]"
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function OverviewView({
  entries,
  onGenerateOverview,
  onAddEntry,
  onOpenHistory,
  onOpenDate,
  overviewRequest,
}: {
  entries: Reflection[];
  onGenerateOverview: (
    reflectionId: string,
    sourceSignature: string,
  ) => void;
  onAddEntry: () => void;
  onOpenHistory: () => void;
  onOpenDate: (date: string) => void;
  overviewRequest: OverviewRequest;
}) {
  const availableEntries = entries.filter((entry) => entry.entryDate <= today());
  const entryCount = availableEntries.length;
  const analyzedEntryCount = Math.min(entryCount, OVERVIEW_ANALYSIS_LIMIT);
  const stats = buildOverviewStats(availableEntries, today());
  const maturity = getOverviewMaturity(entryCount);
  const latestReflection = availableEntries[0] || null;
  const signalsSource = buildOverviewSourceSignature(availableEntries);
  const savedSignals = latestReflection?.overview?.signals ?? null;
  const overviewIsCurrent =
    latestReflection?.overview?.signalsSource === signalsSource;
  const needsOverview =
    latestReflection !== null &&
    maturity !== "collecting" &&
    !overviewIsCurrent;
  const requestForLatest =
    latestReflection &&
    overviewRequest?.reflectionId === latestReflection.id &&
    overviewRequest.sourceSignature === signalsSource
      ? overviewRequest
      : null;

  useEffect(() => {
    if (needsOverview && requestForLatest === null) {
      onGenerateOverview(latestReflection.id, signalsSource);
    }
  }, [
    latestReflection,
    needsOverview,
    onGenerateOverview,
    requestForLatest,
    signalsSource,
  ]);

  return (
    <div className={styles.overviewFrame}>
      <header className={styles.overviewHeader}>
        <p>Ваш дневник</p>
        <h1 className="font-serif-display text-4xl font-black leading-none tracking-[-0.06em] sm:text-5xl">
          Обзор
        </h1>
      </header>

      <div className={styles.overviewBody}>
        {maturity === "collecting" ? (
          <CollectingOverview entryCount={entryCount} onAddEntry={onAddEntry} />
        ) : savedSignals === null ? (
          <OverviewLoadingState
            isLoading={requestForLatest?.status === "loading"}
            onRetry={() =>
              latestReflection &&
              onGenerateOverview(latestReflection.id, signalsSource)
            }
            showError={requestForLatest?.status === "error"}
          />
        ) : (
          <div className="grid gap-4">
            {needsOverview && (
              <OverviewUpdateStatus
                isLoading={requestForLatest?.status === "loading"}
                onRetry={() =>
                  latestReflection &&
                  onGenerateOverview(latestReflection.id, signalsSource)
                }
                showError={requestForLatest?.status === "error"}
              />
            )}
            {savedSignals.length === 0 ? (
              <NoOverviewSignals
                entryCount={analyzedEntryCount}
                maturity={maturity}
                onAddEntry={onAddEntry}
                onOpenHistory={onOpenHistory}
              />
            ) : (
              <EvidenceOverview
                entries={availableEntries}
                onOpenDate={onOpenDate}
                signals={savedSignals}
              />
            )}
          </div>
        )}
      </div>

      <OverviewStatsDisclosure stats={stats} />
    </div>
  );
}

function CollectingOverview({
  entryCount,
  onAddEntry,
}: {
  entryCount: number;
  onAddEntry: () => void;
}) {
  const remaining = Math.max(3 - entryCount, 0);

  return (
    <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/82 p-7 text-center shadow-[0_16px_45px_rgba(57,37,20,0.06)]">
      <p className="font-serif-display text-3xl font-black tracking-[-0.05em]">
        Пока недостаточно данных
      </p>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-[#6c5b4d]">
        MindFlow начнёт искать доказательные сигналы после третьей записи. До
        этого подробный анализ каждой рефлексии доступен в Истории.
      </p>
      <p className="mt-4 text-sm font-black text-[#8b5a22]">
        {entryCount === 0
          ? "Нужны первые 3 записи"
          : `Осталось ${remaining} ${pluralize(remaining, "запись", "записи", "записей")}`}
      </p>
      <button
        className="mt-6 rounded-full bg-[#d58b22] px-5 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-[#bd741c]"
        onClick={onAddEntry}
        type="button"
      >
        {entryCount === 0 ? "Сделать первую запись" : "Добавить запись"}
      </button>
    </section>
  );
}

function NoOverviewSignals({
  entryCount,
  maturity,
  onAddEntry,
  onOpenHistory,
}: {
  entryCount: number;
  maturity: "early" | "established";
  onAddEntry: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/82 p-7 text-center shadow-[0_16px_45px_rgba(57,37,20,0.06)]">
      <p className="font-serif-display text-3xl font-black tracking-[-0.05em]">
        Подтверждённых закономерностей пока нет
      </p>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-[#6c5b4d]">
        Проанализировано {entryCount} {pluralize(entryCount, "запись", "записи", "записей")}. MindFlow не нашёл незакрытого намерения,
        повторяющегося стопора или непроверенной гипотезы, подтверждённых
        минимум тремя рефлексиями.
      </p>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#7b6a5b]">
        {maturity === "early"
          ? "Это ранний обзор: отсутствие вывода точнее, чем предположение на малом объёме данных."
          : "Истории уже достаточно для анализа, но экран останется пустым, пока не появится практически полезный сигнал."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          className="rounded-full bg-[#d58b22] px-5 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-[#bd741c]"
          onClick={onAddEntry}
          type="button"
        >
          Добавить запись
        </button>
        <button
          className="rounded-full border border-[#3a2a1d]/10 px-5 py-3 font-black text-[#7a4a1d] transition hover:bg-[#3a2a1d]/5"
          onClick={onOpenHistory}
          type="button"
        >
          Открыть историю
        </button>
      </div>
    </section>
  );
}

function EvidenceOverview({
  entries,
  onOpenDate,
  signals,
}: {
  entries: Reflection[];
  onOpenDate: (date: string) => void;
  signals: NonNullable<NonNullable<Reflection["overview"]>["signals"]>;
}) {
  const primarySignal = signals[0];
  const [expandedSignalKey, setExpandedSignalKey] = useState<string | null>(
    null,
  );
  if (!primarySignal) {
    return null;
  }
  const secondarySignals = signals.slice(1);

  return (
    <div className={styles.overviewEvidence}>
      <div className={styles.overviewSectionHeading}>
        <p>Что видно сейчас</p>
        <span>Подтверждено тремя и более записями</span>
      </div>

      <OverviewSignalCard
        entries={entries}
        onOpenDate={onOpenDate}
        signal={primarySignal}
      />

      {secondarySignals.length > 0 && (
        <aside
          aria-label="Другие подтверждённые сигналы"
          className={styles.overviewSecondary}
        >
          <p className={styles.overviewSecondaryLabel}>
            <span>Ещё сигналы</span>
            <span>по важности</span>
          </p>
          <div className={styles.overviewSecondaryCards}>
            {secondarySignals.map((signal) => {
              const signalKey = `${signal.kind}:${signal.title}`;
              return (
                <OverviewSignalCard
                  compact
                  entries={entries}
                  expanded={expandedSignalKey === signalKey}
                  key={signalKey}
                  onOpenDate={onOpenDate}
                  onToggleExpanded={() =>
                    setExpandedSignalKey((currentKey) =>
                      currentKey === signalKey ? null : signalKey,
                    )
                  }
                  signal={signal}
                />
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
}

function OverviewRhythm({
  stats,
}: {
  stats: ReturnType<typeof buildOverviewStats>;
}) {
  const activeDaysLabel = pluralize(
    stats.activeDays,
    "день",
    "дня",
    "дней",
  );
  const entriesLabel = pluralize(
    stats.totalEntries,
    "запись",
    "записи",
    "записей",
  );
  const streakLabel = pluralize(
    stats.longestStreak,
    "день",
    "дня",
    "дней",
  );
  const completedLabel = pluralize(
    stats.completedActions,
    "задача доведена до конца",
    "задачи доведены до конца",
    "задач доведено до конца",
  );
  const streakCopy =
    stats.longestStreak > 1
      ? `Лучшая серия — ${stats.longestStreak} ${streakLabel} подряд.`
      : "Лучшая серия пока — 1 день.";

  return (
    <section
      aria-labelledby="overview-rhythm-heading"
      className={styles.overviewRhythm}
    >
      <div className={styles.overviewRhythmIntro}>
        <p>История ритма</p>
        <h2 id="overview-rhythm-heading">
          {stats.activeDays} {activeDaysLabel} с MindFlow
        </h2>
        <span>
          {stats.totalEntries > 0
            ? `За это время появилось ${stats.totalEntries} ${entriesLabel}. ${streakCopy}`
            : "Здесь постепенно проявится ваш собственный ритм записей."}
        </span>
      </div>

      <div className={styles.overviewRhythmCompletion}>
        <span aria-hidden="true" className={styles.overviewRhythmCheck}>
          ✓
        </span>
        <strong>{stats.completedActions}</strong>
        <span>{completedLabel}</span>
      </div>

      <div className={styles.overviewActivity}>
        <div className={styles.overviewActivityHeading}>
          <span>Последние 28 дней</span>
          <span>
            <i aria-hidden="true" /> день с записью
          </span>
        </div>
        <div
          aria-label="Активность записей за последние 28 дней"
          className={styles.overviewActivityDays}
          role="list"
        >
          {stats.recentDays.map((day) => (
            <time
              aria-label={`${formatDateShort(day.date)}: ${day.hasEntry ? "есть запись" : "нет записи"}`}
              className={day.hasEntry ? styles.overviewActivityDayActive : ""}
              dateTime={day.date}
              key={day.date}
              role="listitem"
              title={`${formatDateShort(day.date)} — ${day.hasEntry ? "есть запись" : "нет записи"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function OverviewStatsDisclosure({
  stats,
}: {
  stats: ReturnType<typeof buildOverviewStats>;
}) {
  const activeDaysLabel = pluralize(
    stats.activeDays,
    "день",
    "дня",
    "дней",
  );
  const entriesLabel = pluralize(
    stats.totalEntries,
    "запись",
    "записи",
    "записей",
  );
  const completedLabel = pluralize(
    stats.completedActions,
    "задача завершена",
    "задачи завершены",
    "задач завершено",
  );

  return (
    <details className={styles.overviewStatsDisclosure}>
      <summary className={styles.overviewStatsSummary}>
        <span>
          <strong>Статистика использования</strong>
          <span>
            {stats.activeDays} {activeDaysLabel} · {stats.totalEntries}{" "}
            {entriesLabel} · {stats.completedActions} {completedLabel}
          </span>
        </span>
        <span aria-hidden="true" className={styles.overviewStatsChevron}>
          <svg fill="none" viewBox="0 0 20 20">
            <path
              d="m5.5 7.5 4.5 4.5 4.5-4.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        </span>
      </summary>
      <div className={styles.overviewStatsContent}>
        <OverviewRhythm stats={stats} />
      </div>
    </details>
  );
}

function OverviewSignalCard({
  compact = false,
  entries,
  expanded = false,
  onOpenDate,
  onToggleExpanded,
  signal,
}: {
  compact?: boolean;
  entries: Reflection[];
  expanded?: boolean;
  onOpenDate: (date: string) => void;
  onToggleExpanded?: () => void;
  signal: NonNullable<NonNullable<Reflection["overview"]>["signals"]>[number];
}) {
  const evidence = groupSignalEvidence(signal, entries);
  const title = hasExternalObserverVoice(signal.title)
    ? signalKindLabel(signal.kind)
    : signal.title;
  const finding = safeSignalFinding(signal);
  const recommendation =
    signal.recommendation &&
    !hasExternalObserverVoice(signal.recommendation)
      ? signal.recommendation
      : null;

  if (compact) {
    return (
      <article
        className={`${styles.overviewSecondaryCard} ${
          expanded ? styles.overviewSecondaryCardExpanded : ""
        } p-5`}
      >
        <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#a96214]">
          {signalKindLabel(signal.kind)}
        </p>
        <h2 className="mt-3 font-serif-display text-2xl font-black leading-tight tracking-[-0.035em]">
          {title}
        </h2>
        <p
          className={`mt-3 text-sm leading-6 text-[#6c5b4d] ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {finding}
        </p>
        {expanded && recommendation && (
          <div className={styles.overviewSecondaryRecommendation}>
            <p>Следующий шаг</p>
            <span>{recommendation}</span>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#3a2a1d]/8 pt-4">
          <span className="text-xs font-bold text-[#8b7868]">
            Подтверждено: {evidence.length}{" "}
            {pluralize(evidence.length, "день", "дня", "дней")}
          </span>
          <button
            aria-expanded={expanded}
            className={styles.overviewSecondaryToggle}
            onClick={onToggleExpanded}
            type="button"
          >
            {expanded ? "Свернуть" : "Развернуть"}
            <svg
              aria-hidden="true"
              className={`${styles.overviewSecondaryChevron} ${
                expanded ? styles.overviewSecondaryChevronExpanded : ""
              }`}
              fill="none"
              viewBox="0 0 20 20"
            >
              <path
                d="m5.5 7.5 4.5 4.5 4.5-4.5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
            </svg>
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/86 p-5 shadow-[0_16px_45px_rgba(57,37,20,0.06)] sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a96214]">
        {signalKindLabel(signal.kind)}
      </p>
      <h2 className="mt-3 font-serif-display text-2xl font-black tracking-[-0.035em] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 leading-8 text-[#4f4034]">{finding}</p>

      {recommendation && (
        <div className="mt-5 rounded-3xl bg-[#edf1e8] p-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#596a4d]">
            Следующий шаг
          </p>
          <p className="mt-2 leading-7 text-[#42513a]">{recommendation}</p>
        </div>
      )}

      <div className="mt-5 border-t border-[#3a2a1d]/8 pt-4">
        <p className="text-sm font-black text-[#7a6a5c]">
          Подтверждающие записи
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {evidence.map((item) => (
            <button
              className="rounded-full border border-[#3a2a1d]/10 px-3 py-2 text-sm font-black text-[#7a4a1d] transition hover:bg-[#3a2a1d]/5"
              key={item.date}
              onClick={() => onOpenDate(item.date)}
              type="button"
            >
              {formatDateShort(item.date)}
              {item.count > 1 ? ` · ${item.count} записи` : ""}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function OverviewUpdateStatus({
  isLoading,
  onRetry,
  showError,
}: {
  isLoading: boolean;
  onRetry: () => void;
  showError: boolean;
}) {
  if (showError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f3dfbd]/58 px-4 py-3 text-sm text-[#6b471f]">
        <p className="font-bold">Сохранён прошлый обзор. Обновить его не удалось.</p>
        <button
          className="rounded-full border border-[#6b471f]/15 px-3 py-2 font-black transition hover:bg-white/45"
          onClick={onRetry}
          type="button"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <p
      aria-live="polite"
      className="rounded-2xl bg-[#eee7ef]/58 px-4 py-3 text-sm font-bold text-[#66546a]"
    >
      {isLoading
        ? "Обновляю выводы по последним записям…"
        : "Сохранённый обзор ожидает обновления."}
    </p>
  );
}

function safeSignalFinding(
  signal: NonNullable<NonNullable<Reflection["overview"]>["signals"]>[number],
) {
  if (!hasExternalObserverVoice(signal.finding)) {
    return signal.finding;
  }

  if (signal.kind === "unfinished_intention") {
    return `Намерение подтверждено в ${signal.evidenceReflectionIds.length} записях, но его выполнение или результат позднее не зафиксированы.`;
  }
  if (signal.kind === "recurring_blocker") {
    return `Один и тот же стопор подтверждён в ${signal.evidenceReflectionIds.length} записях и пока остаётся незакрытым.`;
  }
  return `Проверяемое предположение встречается в ${signal.evidenceReflectionIds.length} записях, но результат проверки позднее не зафиксирован.`;
}

function OverviewLoadingState({
  isLoading,
  onRetry,
  showError,
}: {
  isLoading: boolean;
  onRetry: () => void;
  showError: boolean;
}) {
  if (showError) {
    return (
      <div className="rounded-3xl bg-[#eee7ef]/58 p-5">
        <p className="font-bold leading-7 text-[#66546a]">
          Не получилось проверить историю.
        </p>
        <button
          className="mt-3 rounded-full border border-[#66546a]/15 px-4 py-2 text-sm font-black text-[#66546a] transition hover:bg-white/45"
          onClick={onRetry}
          type="button"
        >
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="rounded-3xl bg-[#eee7ef]/58 p-5 text-[#66546a]"
    >
      <p className="font-bold">
        {isLoading
          ? "Проверяю историю на незакрытые циклы…"
          : "Доказательный обзор ещё не сформирован."}
      </p>
      <p className="mt-2 text-sm leading-6">
        Результат появится только при наличии сигнала, подтверждённого минимум
        тремя отдельными записями.
      </p>
    </div>
  );
}

function groupSignalEvidence(
  signal: NonNullable<NonNullable<Reflection["overview"]>["signals"]>[number],
  entries: Reflection[],
) {
  const evidenceIds = new Set(signal.evidenceReflectionIds);
  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (evidenceIds.has(entry.id)) {
      counts.set(entry.entryDate, (counts.get(entry.entryDate) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function signalKindLabel(
  kind: NonNullable<NonNullable<Reflection["overview"]>["signals"]>[number]["kind"],
) {
  if (kind === "unfinished_intention") {
    return "Незакрытое намерение";
  }
  if (kind === "recurring_blocker") {
    return "Повторяющийся стопор";
  }
  return "Непроверенная гипотеза";
}

function HistoryView({
  backLabel,
  groupedByDate,
  onBack,
  onDelete,
  onOpenDate,
  onRetryAnalysis,
  onDecideSuggestion,
  onToggleTodos,
  reanalyzingReflectionId,
  resultHeadingRef,
  savedReflectionId,
  selectedDate,
  suggestionError,
  todoError,
  updatingSuggestionId,
  updatingTodoKey,
}: {
  backLabel: string;
  groupedByDate: Record<string, Reflection[]>;
  onBack: () => void;
  onDelete: (reflectionId: string) => void;
  onOpenDate: (date: string) => void;
  onRetryAnalysis: (reflectionId: string) => void;
  onDecideSuggestion: (
    reflectionId: string,
    decision: "accepted" | "dismissed",
  ) => void;
  onToggleTodos: (targets: TodoTarget[], completed: boolean) => void;
  reanalyzingReflectionId: string | null;
  resultHeadingRef: RefObject<HTMLHeadingElement | null>;
  savedReflectionId: string | null;
  selectedDate: string | null;
  suggestionError: TodoError | null;
  todoError: TodoError | null;
  updatingSuggestionId: string | null;
  updatingTodoKey: string | null;
}) {
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
            История
          </p>
          <h1 className="mt-2 font-serif-display text-4xl font-black leading-none tracking-[-0.06em] sm:text-5xl">
            Дни
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-[#6c5b4d]">
            Выберите день, чтобы открыть его мысли, инсайты и действия.
          </p>
        </header>
        <CompactHistory
          groupedByDate={groupedByDate}
          onSelect={onOpenDate}
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
          ← {backLabel}
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
          onDecideSuggestion={onDecideSuggestion}
          onRetryAnalysis={onRetryAnalysis}
          onToggleTodos={onToggleTodos}
          reanalyzingReflectionId={reanalyzingReflectionId}
          suggestionError={suggestionError}
          todoError={todoError}
          updatingSuggestionId={updatingSuggestionId}
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
  onDecideSuggestion,
  onRetryAnalysis,
  onToggleTodos,
  reanalyzingReflectionId,
  suggestionError,
  todoError,
  updatingSuggestionId,
  updatingTodoKey,
}: {
  entries: Reflection[];
  onDelete: (reflectionId: string) => void;
  onDecideSuggestion: (
    reflectionId: string,
    decision: "accepted" | "dismissed",
  ) => void;
  onRetryAnalysis: (reflectionId: string) => void;
  onToggleTodos: (targets: TodoTarget[], completed: boolean) => void;
  reanalyzingReflectionId: string | null;
  suggestionError: TodoError | null;
  todoError: TodoError | null;
  updatingSuggestionId: string | null;
  updatingTodoKey: string | null;
}) {
  const [todoAppRequests, setTodoAppRequests] =
    useState<TodoAppRequestState>({});
  const primaryInsights = buildPrimaryInsights(entries).map(
    neutralizeExternalObserverVoice,
  );
  const actions = groupDayActions(entries);
  const pendingSuggestions = entries.flatMap((entry) =>
    entry.overview?.suggestedAction?.status === "pending"
      ? [{ reflectionId: entry.id, ...entry.overview.suggestedAction }]
      : [],
  );
  const fallbackEntries = entries.filter(
    (entry) => entry.analysisSource === "fallback",
  );
  const actionSupport =
    entries.find((entry) => entry.overview?.actionSupport)?.overview
      ?.actionSupport || null;
  const orderedActions = actionSupport
    ? [...actions].sort(
        (left, right) =>
          Number(right.todo === actionSupport.action) -
          Number(left.todo === actionSupport.action),
      )
    : actions;

  async function sendTodoToTodoApp(input: {
    sourceId: string;
    reflectionId: string;
    todo: string;
  }) {
    if (todoAppRequests[input.sourceId]?.status === "sending") {
      return;
    }

    setTodoAppRequests((current) => ({
      ...current,
      [input.sourceId]: {
        status: "sending",
        message: "Добавляю в TodoApp…",
      },
    }));

    try {
      const response = await fetch("/api/integrations/todo-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reflectionId: input.reflectionId,
          targetDate: today(),
          todo: input.todo,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        status?: "created" | "duplicate";
      };

      if (!response.ok || !data.status) {
        throw new Error(
          data.error || "Не получилось добавить задачу в TodoApp.",
        );
      }

      setTodoAppRequests((current) => ({
        ...current,
        [input.sourceId]: {
          status: "sent",
          message:
            data.status === "duplicate"
              ? "Уже добавлено в TodoApp"
              : "Добавлено в TodoApp",
        },
      }));
    } catch (error) {
      setTodoAppRequests((current) => ({
        ...current,
        [input.sourceId]: {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Не получилось добавить задачу в TodoApp.",
        },
      }));
    }
  }

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

      {fallbackEntries.map((entry) => {
        const isReanalyzing = reanalyzingReflectionId === entry.id;
        return (
          <section
            className="rounded-3xl border border-[#d58b22]/18 bg-[#f6e6c6]/72 p-5"
            key={entry.id}
          >
            <p className="font-black text-[#6b471f]">
              Запись пока разобрана базовыми правилами
            </p>
            <p className="mt-2 text-sm leading-6 text-[#806344]">
              Исходный текст сохранён. Можно ещё раз запросить полный AI-анализ.
            </p>
            <button
              className="mt-4 rounded-full bg-[#d58b22] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#bd741c] disabled:cursor-wait disabled:opacity-65"
              disabled={reanalyzingReflectionId !== null}
              onClick={() => onRetryAnalysis(entry.id)}
              type="button"
            >
              {isReanalyzing ? "Повторяю анализ…" : "Повторить AI-анализ"}
            </button>
          </section>
        );
      })}

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
          Твои шаги и намерения
        </h2>
        {orderedActions.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {orderedActions.map((action) => {
              const isCompleted = action.sources.every(
                (source) => source.completed,
              );
              const isPrimaryAction = action.todo === actionSupport?.action;
              const isMindFlowSuggested = action.sources.some((source) =>
                entries.some(
                  (entry) =>
                    entry.id === source.reflectionId &&
                    entry.overview?.suggestedAction?.status === "accepted" &&
                    entry.overview.suggestedAction.action === action.todo,
                ),
              );
              const completedCount = action.sources.filter(
                (source) => source.completed,
              ).length;
              const targets = action.sources.map((source) => ({
                reflectionId: source.reflectionId,
                todo: source.todo,
              }));
              const primarySource = getPrimaryTodoSource(action.sources);
              if (!primarySource) {
                return null;
              }
              const todoAppPayload = buildTodoAppImportPayload({
                title: action.todo,
                sources: action.sources,
              });
              const todoAppTask = todoAppPayload.tasks[0];
              const todoAppRequest = todoAppRequests[todoAppTask.sourceId];
              return (
                <li
                  className={
                    isPrimaryAction
                      ? "rounded-2xl border border-[#d58b22]/20 bg-[#f6e6c6] px-4 py-4"
                      : "rounded-2xl bg-white/70 px-4 py-3"
                  }
                  key={action.todo}
                >
                  {isPrimaryAction && (
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#9a5a13]">
                      Фокус среди твоих намерений
                    </p>
                  )}
                  <div className="flex items-start gap-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
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
                        {isMindFlowSuggested && (
                          <span className="mt-1 block text-xs font-bold text-[#8b5a22]">
                            Предложено MindFlow · добавлено тобой
                          </span>
                        )}
                        {isPrimaryAction &&
                          actionSupport?.rationale &&
                          !hasExternalObserverVoice(actionSupport.rationale) && (
                          <span className="mt-3 block border-t border-[#9a5a13]/10 pt-3 text-sm font-normal leading-6 text-[#806344]">
                            {actionSupport.rationale}
                          </span>
                        )}
                        {todoAppRequest && (
                          <span
                            className={
                              todoAppRequest.status === "error"
                                ? "mt-2 block text-xs font-bold text-[#9b3b2a]"
                                : "mt-2 block text-xs font-bold text-[#56704f]"
                            }
                            role={
                              todoAppRequest.status === "error"
                                ? "alert"
                                : "status"
                            }
                          >
                            {todoAppRequest.message}
                          </span>
                        )}
                      </span>
                    </label>
                    <button
                      aria-label={`${todoAppRequest?.status === "error" ? "Повторить добавление в TodoApp" : "Добавить в TodoApp"}: ${action.todo}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#56704f]/15 bg-white/80 text-xl font-black leading-none text-[#56704f] transition hover:border-[#56704f]/30 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56704f] disabled:cursor-default disabled:opacity-70"
                      disabled={
                        todoAppRequest?.status === "sending" ||
                        todoAppRequest?.status === "sent"
                      }
                      onClick={() =>
                        void sendTodoToTodoApp({
                          sourceId: todoAppTask.sourceId,
                          reflectionId: primarySource.reflectionId,
                          todo: primarySource.todo,
                        })
                      }
                      title={
                        todoAppRequest?.status === "error"
                          ? "Повторить добавление в TodoApp"
                          : "Добавить в TodoApp"
                      }
                      type="button"
                    >
                      <span aria-hidden="true">
                        {todoAppRequest?.status === "sending"
                          ? "…"
                          : todoAppRequest?.status === "sent"
                            ? "✓"
                            : todoAppRequest?.status === "error"
                              ? "↻"
                              : "+"}
                      </span>
                    </button>
                  </div>
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
        {pendingSuggestions.length > 0 && (
          <div className="mt-5 grid gap-3 border-t border-[#56704f]/12 pt-5">
            {pendingSuggestions.map((suggestion) => {
              const isUpdating =
                updatingSuggestionId === suggestion.reflectionId;
              const hasError =
                suggestionError?.reflectionId === suggestion.reflectionId;
              return (
                <article
                  className="rounded-2xl border border-[#a96214]/18 bg-[#fffaf1]/88 p-4"
                  key={suggestion.reflectionId}
                >
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#a96214]">
                    MindFlow предлагает
                  </p>
                  <p className="mt-3 font-black leading-7">
                    {suggestion.action}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#6c5b4d]">
                    {suggestion.rationale}
                  </p>
                  <p className="mt-3 border-l-2 border-[#d58b22]/45 pl-3 text-sm leading-6 text-[#806344]">
                    Из инсайта: {neutralizeExternalObserverVoice(suggestion.sourceInsight)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded-full bg-[#56704f] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#476241] disabled:cursor-wait disabled:opacity-60"
                      disabled={updatingSuggestionId !== null}
                      onClick={() =>
                        onDecideSuggestion(suggestion.reflectionId, "accepted")
                      }
                      type="button"
                    >
                      {isUpdating ? "Сохраняю…" : "Добавить в шаги"}
                    </button>
                    <button
                      className="rounded-full border border-[#3a2a1d]/12 px-4 py-2.5 text-sm font-black text-[#6c5b4d] transition hover:bg-white/80 disabled:cursor-wait disabled:opacity-60"
                      disabled={updatingSuggestionId !== null}
                      onClick={() =>
                        onDecideSuggestion(suggestion.reflectionId, "dismissed")
                      }
                      type="button"
                    >
                      Не сейчас
                    </button>
                  </div>
                  {hasError && (
                    <p
                      className="mt-3 rounded-xl bg-[#f5d8cc] p-3 text-sm font-bold text-[#7f291d]"
                      role="alert"
                    >
                      {suggestionError.message}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
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
                    {buildReflectionPreview(reflection)}
                  </span>
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#efe5d5] text-xl leading-none transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-4 border-t border-[#3a2a1d]/8 pt-4">
                <div className="mb-4 flex justify-end">
                  <EntryActions
                    isReanalyzing={reanalyzingReflectionId === reflection.id}
                    onDelete={() => onDelete(reflection.id)}
                    onRetryAnalysis={() => onRetryAnalysis(reflection.id)}
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
  isReanalyzing,
  onDelete,
  onRetryAnalysis,
  reflectionId,
}: {
  isReanalyzing: boolean;
  onDelete: () => void;
  onRetryAnalysis: () => void;
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
          className="w-full rounded-xl px-3 py-2 text-left text-sm font-black text-[#7a4a1d] hover:bg-[#efe5d5] disabled:cursor-wait disabled:opacity-65"
          disabled={isReanalyzing}
          onClick={onRetryAnalysis}
          type="button"
        >
          {isReanalyzing ? "Обновляю анализ…" : "Обновить AI-анализ"}
        </button>
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
                  {hasExternalObserverVoice(repeat.description)
                    ? "Связь подтверждена в нескольких записях."
                    : repeat.description}
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

function CompactHistory({
  groupedByDate,
  onSelect,
}: {
  groupedByDate: Record<string, Reflection[]>;
  onSelect: (date: string) => void;
}) {
  const days = Object.entries(groupedByDate).sort(([dateA], [dateB]) =>
    dateB.localeCompare(dateA),
  );
  const [previewDate, setPreviewDate] = useState<string | null>(
    days[0]?.[0] ?? null,
  );
  const activePreviewDate =
    previewDate && groupedByDate[previewDate]
      ? previewDate
      : days[0]?.[0] ?? null;
  const previewEntries = activePreviewDate
    ? groupedByDate[activePreviewDate] || []
    : [];
  const previewEntry = previewEntries[0] || null;
  const previewInsights = buildPrimaryInsights(previewEntries);
  const previewActions = groupDayActions(previewEntries);
  const previewTitle = previewEntry
    ? previewEntry.themes
        .filter((theme) => !hasExternalObserverVoice(theme))
        .slice(0, 2)
        .join(" · ") || "День в деталях"
    : "День в деталях";

  return (
    <section className={styles.historyExplorer}>
      <div className={styles.historyIndex}>
        {days.map(([date, items]) => {
          const isPreviewed = activePreviewDate === date;
          return (
            <button
              className={`${styles.historyIndexItem} ${
                isPreviewed ? styles.historyIndexItemActive : ""
              } flex w-full items-center gap-4 px-5 py-5 text-left text-[#3a2a1d] transition sm:px-6`}
              key={date}
              onClick={() => onSelect(date)}
              onFocus={() => setPreviewDate(date)}
              onMouseEnter={() => setPreviewDate(date)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8b5a22]">
                  {formatDate(date)}
                </p>
                <p className="mt-2 line-clamp-2 leading-6 text-[#5f5043]">
                  {items[0]
                    ? buildReflectionPreview(items[0])
                    : "Запись сохранена — откройте день, чтобы посмотреть детали."}
                </p>
                <p className="mt-2 text-xs font-bold text-[#9a8b7d]">
                  {items.length} {pluralize(items.length, "запись", "записи", "записей")}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="shrink-0 text-xl font-bold text-[#a96214]"
              >
                →
              </span>
            </button>
          );
        })}
        {days.length === 0 && (
          <p className="p-7 text-center text-[#6c5b4d]">
            История появится после первой записи.
          </p>
        )}
      </div>

      {previewEntry && activePreviewDate && (
        <article
          aria-live="polite"
          className={styles.historyPreview}
          key={activePreviewDate}
        >
          <div className={styles.historyPreviewTopline}>
            <span>Предпросмотр дня</span>
            <span>
              {previewEntries.length} {pluralize(previewEntries.length, "запись", "записи", "записей")}
            </span>
          </div>
          <p className={styles.historyPreviewDate}>
            {formatDate(activePreviewDate)}
          </p>
          <h2 className={styles.historyPreviewTitle}>{previewTitle}</h2>
          <p className={styles.historyPreviewSummary}>
            {buildReflectionPreview(previewEntry)}
          </p>

          {previewInsights[0] && (
            <div className={styles.historyPreviewInsight}>
              <p>
                <DiaryIcon name="overview" />
                Главное
              </p>
              <span>{neutralizeExternalObserverVoice(previewInsights[0])}</span>
            </div>
          )}

          <div className={styles.historyPreviewMeta}>
            <span>
              <strong>{previewInsights.length}</strong>
              {pluralize(previewInsights.length, "инсайт", "инсайта", "инсайтов")}
            </span>
            <span>
              <strong>{previewActions.length}</strong>
              {pluralize(previewActions.length, "действие", "действия", "действий")}
            </span>
          </div>

          <button
            className={styles.historyPreviewButton}
            onClick={() => onSelect(activePreviewDate)}
            type="button"
          >
            Открыть полный разбор <DiaryIcon name="arrow" />
          </button>
        </article>
      )}
    </section>
  );
}

function MindFlowBrand() {
  return (
    <div aria-label="MindFlow" className={styles.brand}>
      <span aria-hidden="true" className={styles.brandMark}>
        <MindFlowMark />
      </span>
      <span>MindFlow</span>
    </div>
  );
}

function DiaryIcon({
  name,
}: {
  name:
    | "arrow"
    | "calendar"
    | "capture"
    | "history"
    | "overview"
    | "thread";
}) {
  const common = {
    "aria-hidden": true,
    className: styles.navIcon,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (name === "capture") {
    return (
      <svg {...common}>
        <path d="M6 18c3.2-.8 5.9-2.6 8-5.1 1.5-1.8 2.5-3.7 2.9-5.7.2-1.2-.8-2.2-2-2-2 .4-3.9 1.4-5.7 2.9C6.7 10.2 4.9 12.9 4 16l-.7 4.7L8 20l4-4" />
      </svg>
    );
  }
  if (name === "history") {
    return (
      <svg {...common}>
        <path d="M6 4.5h11.5A1.5 1.5 0 0 1 19 6v13.5H7.5A2.5 2.5 0 0 1 5 17V6.5a2 2 0 0 1 2-2Z" />
        <path d="M8.5 4.5v15M11 8h5M11 12h5" />
      </svg>
    );
  }
  if (name === "overview") {
    return (
      <svg {...common}>
        <path d="m12 3 1.1 3.2L16 8l-2.9 1.8L12 13l-1.1-3.2L8 8l2.9-1.8L12 3ZM18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5.5 12l.8 2.2 2.2.8-2.2.8L5.5 18l-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect height="16" rx="2" width="18" x="3" y="5" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    );
  }
  if (name === "thread") {
    return (
      <svg {...common}>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="12" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M8 5h2a4 4 0 0 1 4 4v0a3 3 0 0 0 3 3h-1M8 19h2a4 4 0 0 0 4-4v0a3 3 0 0 1 3-3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
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
