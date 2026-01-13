export default function SystemHealth() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-4">System Health</h1>
      <div className="grid gap-6">
        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5">
          <h3 className="text-gray-400 mb-2">Fan Curve</h3>
          <div className="h-40 bg-black/20 rounded flex items-center justify-center text-sm text-gray-600">
            [Fan Curve Editor]
          </div>
        </div>
      </div>
    </div>
  );
}
