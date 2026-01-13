export default function MatrixStudio() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-4">Matrix Studio</h1>
      <div className="bg-black rounded-lg border border-gray-800 p-4 inline-block">
        {/* Mock Matrix Grid */}
        <div className="grid grid-cols-[repeat(34,12px)] gap-1">
          {Array.from({ length: 34 * 9 }).map((_, i) => (
            <div key={i} className="w-3 h-3 bg-gray-900 rounded-[1px] hover:bg-primary cursor-pointer transition-colors" />
          ))}
        </div>
      </div>
    </div>
  );
}
