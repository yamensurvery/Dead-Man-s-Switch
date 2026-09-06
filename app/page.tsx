
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0B0E14]">
      <header className="mx-auto max-w-3xl px-6 py-8 flex items-center justify-between">
        <span className="font-mono text-sm text-[#E8EAED] tracking-tight">
          deadman
        </span>
        <Link
          href="/auth/login"
          className="font-mono text-sm text-[#9CA3AF] hover:text-[#E8EAED] transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6">
        <section className="py-20 sm:py-28">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#4ADE80]/10 px-3 py-1 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
            <span className="font-mono text-xs font-medium text-[#4ADE80]">
              Right now, this switch would be active
            </span>
          </div>

          <h1 className="font-mono text-3xl sm:text-4xl leading-tight text-[#E8EAED] max-w-xl">
            If you go quiet, this speaks for you.
          </h1>

          <p className="font-mono mt-6 text-base leading-7 text-[#9CA3AF] max-w-md">
            Encrypt files, passwords, and messages today. They stay sealed
            until you miss enough check-ins — then your chosen people get
            access, and not a moment before.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/auth/login"
              className="font-mono rounded-lg bg-[#5EEAD4] px-5 py-3 text-sm font-medium text-[#0B0E14] hover:bg-[#7FF0DD] transition-colors"
            >
              Create a switch
            </Link>
            <a
              href="#how-it-works"
              className="font-mono text-sm text-[#9CA3AF] hover:text-[#E8EAED] transition-colors"
            >
              See how it works
            </a>
          </div>
        </section>

        <section id="how-it-works" className="py-16 border-t border-white/[0.06]">
          <h2 className="font-mono text-lg font-medium text-[#E8EAED] mb-10">
            How it works
          </h2>

          <ol className="relative flex flex-col gap-10 border-l border-white/[0.08] pl-8">
            <Step
              title="Encrypt something worth protecting"
              body="Your files and messages are encrypted in your browser before anything reaches a server. Nobody but you holds the key to what you seal."
            />
            <Step
              title="Check in on your own schedule"
              body="Miss a check-in and a grace period starts — plenty of room for a bad week. Miss that too, and the switch trips."
            />
            <Step
              title="Recipients get exactly what you sealed"
              body="Not before, not partially. Your secret is split across your recipients, so it only reconstructs once enough of them respond."
            />
          </ol>
        </section>

        <section className="py-16 border-t border-white/[0.06]">
          <h2 className="font-mono text-lg font-medium text-[#E8EAED] mb-6">
            Zero-knowledge, by design
          </h2>
          <div className="flex flex-col gap-4">
            <Fact text="Encryption happens in your browser — plaintext never touches our servers." />
            <Fact text="Your secret is split with Shamir's Secret Sharing, so no single recipient can open it alone." />
            <Fact text="We store what we can't read: ciphertext, share fragments, nothing more." />
          </div>
        </section>

        <footer className="py-16 border-t border-white/[0.06]">
          <p className="font-mono text-sm text-[#6B7280]">
            Built as a self-sovereign dead man&apos;s switch — your keys, your
            threshold, your recipients.
          </p>
        </footer>
      </main>
    </div>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <li className="relative">
      <span className="absolute -left-[calc(2rem+3px)] top-1 h-2 w-2 rounded-full bg-[#5EEAD4]" />
      <h3 className="font-mono text-[15px] font-medium text-[#E8EAED]">{title}</h3>
      <p className="font-mono mt-1.5 text-sm leading-6 text-[#9CA3AF] max-w-md">{body}</p>
    </li>
  );
}

function Fact({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#5EEAD4]" />
      <p className="font-mono text-sm leading-6 text-[#9CA3AF]">{text}</p>
    </div>
  );
}
