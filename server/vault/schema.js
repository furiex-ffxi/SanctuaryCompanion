import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  appliedAt: text('applied_at').notNull()
});

export const vaultMetadata = sqliteTable('vault_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const vaultItems = sqliteTable('vault_items', {
  vaultId: text('vault_id').primaryKey(),
  stashedAt: text('stashed_at').notNull(),
  sourceSave: text('source_save').notNull(),
  sourceSaveSort: text('source_save_sort'),
  displayName: text('display_name').notNull(),
  displayNameSort: text('display_name_sort'),
  typeCode: text('type_code'),
  typeName: text('type_name'),
  typeNameSort: text('type_name_sort'),
  slot: text('slot'),
  category: text('category'),
  quality: integer('quality'),
  level: integer('level'),
  setName: text('set_name'),
  searchText: text('search_text').notNull(),
  itemJson: text('item_json').notNull(),
  status: text('status').notNull().default('active'),
  updatedAt: text('updated_at').notNull()
}, (table) => ({
  orderIdx: index('vault_items_order').on(table.status, table.stashedAt, table.vaultId),
  slotIdx: index('vault_items_slot').on(table.status, table.slot),
  categoryIdx: index('vault_items_category').on(table.status, table.category),
  qualityIdx: index('vault_items_quality').on(table.status, table.quality),
  levelIdx: index('vault_items_level').on(table.status, table.level),
  setNameIdx: index('vault_items_set_name').on(table.status, table.setName)
}));

export const appliedOperations = sqliteTable('applied_operations', {
  operationId: text('operation_id').primaryKey(),
  operation: text('operation').notNull(),
  appliedAt: text('applied_at').notNull()
});
