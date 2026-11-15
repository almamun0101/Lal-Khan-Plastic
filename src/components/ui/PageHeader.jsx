function PageHeader({ title, description, actions, back }) {
  return (
    <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-steel-500 dark:text-steel-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export { PageHeader };
