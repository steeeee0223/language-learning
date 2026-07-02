'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { readApiError } from '@/lib/client-http';
import { taskCreationResponseSchema } from '@/lib/schemas/generation-contracts';
import { taskListResponseSchema, type TaskListResponse } from '@/lib/schemas/task-contracts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EllipsisIcon } from 'lucide-react';

async function fetchTasks() {
  const response = await fetch('/api/tasks');
  if (!response.ok) throw new Error(await readApiError(response));
  return taskListResponseSchema.parse(await response.json());
}

async function regenerateTask(taskId: string) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return taskCreationResponseSchema.parse(await response.json());
}

async function deleteTask(taskId: string) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(await readApiError(response));
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
    <div className="not-prose flex flex-col">
      {error ? <p className="text-sm text-destructive mb-5">{error.message}</p> : null}
      {tasksQuery.data.groups.map((group) => (
        <details key={group.story.id} open className="hover:bg-accent px-2">
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
                      {task.lessonUrl ? 
                        <Button 
                          variant="link"
                          nativeButton={false}
                          render={
                            <Link href={task.lessonUrl}/>
                          }
                        >
                          {task.id}
                        </Button>
                       : task.id}
                    </td>
                    <td className="py-3 pr-4 capitalize">{task.status}</td>
                    <td className="py-3 pr-4">{task.cefrLevels.join(', ')}</td>
                    <td className="py-3 pr-4">{task.targetLanguage}</td>
                    <td className="py-3 pr-4">{task.modelPreset}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatCreatedAt(task.createdAt)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger 
                            render={<Button variant="ghost" size="icon-xs" disabled={isMutating} aria-label="Task actions">
                              <EllipsisIcon />
                            </Button>} 
                          />
                          <DropdownMenuContent>
                            <DropdownMenuGroup>
                              {task.status !== 'pending' && (
                                <DropdownMenuItem onClick={() => regenerate.mutate(task.id)}>
                                  Regenerate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => {
                                  if (window.confirm('Delete this task and its local artifacts?')) {
                                    remove.mutate(task.id);
                                  }
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
