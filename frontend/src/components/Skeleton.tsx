/** Reusable skeleton primitives for loading states. */

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-800 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Bone className="h-8 w-40" />
        <Bone className="mt-2 h-4 w-56" />
      </div>
      <div className="flex justify-center">
        <Bone className="h-16 w-full max-w-3xl rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Bone className="h-8 w-40" />
        <div className="flex gap-3">
          <Bone className="h-9 w-24 rounded-lg" />
          <Bone className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      <Bone className="h-10 w-full max-w-sm rounded-lg" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Bone key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Bone className="h-4 w-32" />
        <Bone className="mt-3 h-8 w-64" />
      </div>
      <Bone className="h-10 w-80" />
      <div className="space-y-6">
        <Bone className="h-48 w-full rounded-xl" />
        <Bone className="h-36 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Bone className="h-4 w-32" />
        <Bone className="mt-3 h-8 w-64" />
      </div>
      <Bone className="h-[400px] w-full rounded-xl" />
    </div>
  );
}
