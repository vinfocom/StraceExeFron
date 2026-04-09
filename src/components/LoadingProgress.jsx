// Components/LoadingProgress.jsx
const LoadingProgress = ({ progress, loading }) => {
  if (!loading) return null;

  const { current, total, page, totalPages } = progress;
  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[320px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Loading data...
          </span>
        </div>
        {totalPages > 1 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {page}/{totalPages}
          </span>
        )}
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{current.toLocaleString()} points loaded</span>
        {total > 0 && (
          <span>{percentage}% ({total.toLocaleString()} total)</span>
        )}
      </div>
    </div>
  );
};

export default LoadingProgress;