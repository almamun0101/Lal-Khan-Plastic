function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-steel-300 dark:text-steel-600" />}
      <p className="text-sm font-semibold text-steel-600 dark:text-steel-300">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-steel-400">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export { EmptyState };
