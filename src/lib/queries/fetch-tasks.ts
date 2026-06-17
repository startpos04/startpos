import { eq, useLiveQuery } from '@tanstack/react-db'
import { operationalTaskCollection, userCollection } from '@/db/collections'

export const fetchTasks = (taskId?: string | null) => {
  const result = useLiveQuery(
    q => {
      let query = q
        .from({ task: operationalTaskCollection })
        .leftJoin({ clerk: userCollection }, ({ task, clerk }) => eq(task.clerkId, clerk.id))
        .leftJoin({ creator: userCollection }, ({ task, creator }) => eq(task.creatorId, creator.id))
        .leftJoin({ reviewer: userCollection }, ({ task, reviewer }) => eq(task.reviewerId, reviewer.id))
        .leftJoin({ approver: userCollection }, ({ task, approver }) => eq(task.approverId, approver.id))
        .leftJoin({ canceler: userCollection }, ({ task, canceler }) => eq(task.cancelerId, canceler.id))
        .orderBy(({ task }) => task.createdAt, 'desc')

      if (taskId) query = query.where(({ task }) => eq(task.id, taskId))

      return query.select(({ task, clerk, approver, creator, reviewer, canceler }) => ({
        ...task,
        clerk,
        approver,
        creator,
        reviewer,
        canceler,
      }))
    },
    [taskId],
  )

  return result
}

type TaskData = ReturnType<typeof fetchTasks>['data']
export type feTask = NonNullable<TaskData>[number]
