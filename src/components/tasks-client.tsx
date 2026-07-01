'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { Button } from '@/components/ui/button.tsx';
import { apiErrorResponseSchema, taskCreationResponseSchema } from '@/lib/generation-contracts.ts';
import { taskListResponseSchema, type TaskListResponse } from '@/lib/task-contracts.ts';

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = apiErrorResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.error : 'Request failed.';
}

async function fetchTasks() {
  const response = await fetch('/api/tasks');
  if (!response.ok) throw new Error(await readError(response));
  return taskListResponseSchema.parse(await response.json());
}

async function regenerateTask(taskId: string) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(await readError(response));
  return taskCreationResponseSchema.parse(await response.json());
}

async function deleteTask(taskId: string) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(await readError(response));
}

function formatCreatedAt(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}

export function TasksClient({ initialData }: { initialData: TaskListResponse }) {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks, initialData });
  const regenerate = useMutation({
    mutationFn: regenerateTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const remove = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const error = tasksQuery.error ?? regenerate.error ?? remove.error;
  const isMutating = regenerate.isPending || remove.isPending;

  if (tasksQuery.data.groups.length === 0) {
    return <p>No tasks yet. Create one from Get Started.</p>;
  }

  return (
    <div className="not-prose flex flex-col gap-5">
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      {tasksQuery.data.groups.map((group) => (
        <details key={group.story.id} open className="border-y">
          <summary className="flex cursor-pointer items-center justify-between gap-4 py-3 font-medium">
            <span>{group.story.title}</span>
            <Button
              render={<Link href={`/get-started?story=${encodeURIComponent(group.story.id)}`} />}
              size="sm"
              variant="outline"
            >
              New task
            </Button>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-3 pr-4 font-medium">Task</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">CEFR</th>
                  <th className="py-3 pr-4 font-medium">Language</th>
                  <th className="py-3 pr-4 font-medium">Model</th>
                  <th className="py-3 pr-4 font-medium">Created</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => (
                  <tr key={task.id} className="border-b last:border-b-0">
                    <td className="py-3 pr-4 font-mono text-xs">
                      {task.lessonUrl ? <Link href={task.lessonUrl}>{task.id}</Link> : task.id}
                    </td>
                    <td className="py-3 pr-4 capitalize">{task.status}</td>
                    <td className="py-3 pr-4">{task.cefrLevels.join(', ')}</td>
                    <td className="py-3 pr-4">{task.targetLanguage}</td>
                    <td className="py-3 pr-4">{task.modelPreset}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatCreatedAt(task.createdAt)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        {task.status !== 'pending' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isMutating}
                            onClick={() => regenerate.mutate(task.id)}
                          >
                            Regenerate
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isMutating}
                          onClick={() => {
                            if (window.confirm('Delete this task and its local artifacts?')) {
                              remove.mutate(task.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}
