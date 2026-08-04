// Reusable Subheading Component
export default function Subheading({ text }: { text: string }) {
  return (
    <div className="flex items-center space-x-3 mb-4">
      <div className="w-5 h-1 rounded-full bg-accent"></div>
      <span className="text-accent uppercase text-xs tracking-wider font-normal">
        {text}
      </span>
    </div>
  );
}
