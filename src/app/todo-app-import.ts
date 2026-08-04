const TODO_APP_LOCAL_URL = "http://127.0.0.1:4173/";
const TODO_APP_PRODUCTION_URL = "https://quiet-todo-test.vercel.app/";
const TODO_APP_IMPORT_KEY = "mindflow-import";

export type TodoSource = {
  reflectionId: string;
  entryDate: string;
  createdAt: string;
  todo: string;
};

export type TodoAppImportPayload = {
  version: 1;
  source: "mindflow";
  tasks: Array<{
    sourceId: string;
    title: string;
    sourceDate: string;
    suggestedView: "later";
  }>;
};

export function getTodoAppUrlForEnvironment(environment: string | undefined) {
  return environment === "development"
    ? TODO_APP_LOCAL_URL
    : TODO_APP_PRODUCTION_URL;
}

export function getPrimaryTodoSource(sources: TodoSource[]) {
  return [...sources].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.reflectionId.localeCompare(right.reflectionId),
  )[0];
}

export function buildTodoAppImportPayload(input: {
  title: string;
  sources: TodoSource[];
}) {
  const title = input.title.trim();
  const primarySource = getPrimaryTodoSource(input.sources);

  if (!title || !primarySource) {
    throw new Error("TodoApp import requires a task and its reflection source.");
  }

  const normalizedSourceTodo = primarySource.todo
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU");

  return {
    version: 1,
    source: "mindflow",
    tasks: [
      {
        sourceId: `mindflow:${primarySource.reflectionId}:${normalizedSourceTodo}`,
        title,
        sourceDate: primarySource.entryDate,
        suggestedView: "later",
      },
    ],
  } satisfies TodoAppImportPayload;
}

export function buildTodoAppImportUrl(input: {
  title: string;
  sources: TodoSource[];
}) {
  const payload = buildTodoAppImportPayload(input);
  const fragment = new URLSearchParams({
    [TODO_APP_IMPORT_KEY]: JSON.stringify(payload),
  });
  const url = new URL(getTodoAppUrlForEnvironment(process.env.NODE_ENV));
  url.hash = fragment.toString();

  return url.toString();
}
