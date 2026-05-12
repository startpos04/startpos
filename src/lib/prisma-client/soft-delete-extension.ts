/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { Prisma } from 'prisma/generated/prisma/client'

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: any) {
        const modelName = model.charAt(0).toUpperCase() + model.slice(1)
        const hasDeletedAtField = 'deletedAt' in (Prisma as any)[`${modelName}ScalarFieldEnum` || '']

        if (!hasDeletedAtField) return query(args)

        // --- ENFORCE SOFT DELETE POLICY ---
        if (operation === 'delete' || operation === 'deleteMany') {
          throw new Error(`[Prisma Error]: Hard deletes are FORBIDDEN on model "${model}". Please use .update() to set "deletedAt: new Date()" instead.`)
        }

        // --- AUTOMATIC FILTERING ---
        // We still keep this so devs don't have to manually add "deletedAt: null" to every fetch
        const readOperations = ['findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow', 'count']

        if (readOperations.includes(operation)) {
          args.where = {
            ...args.where,
            deletedAt: null,
          }
        }

        return query(args)
      },
    },
  },
})
