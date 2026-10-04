import Link from "next/link";
import { agentNextAction, type AgentReadiness } from "@/lib/agent";

type StepState = "done" | "current" | "next";

type OnboardingStepsProps = {
  readiness: AgentReadiness;
  paired: boolean;
  completed?: boolean;
};

function stepsFor({ readiness, paired, completed }: OnboardingStepsProps) {
  const setupDone = readiness === "ready";
  const pairDone = paired;

  if (completed && setupDone && pairDone) {
    return {
      nextLabel: "See your progress",
      nextHref: "/compare",
      steps: [
        ["Start setup", "/agent", "done"],
        ["Pair browser", "/agent#pair", "done"],
        ["Choose a video", "/analyze", "done"],
        ["Review results", "/compare", "current"],
      ] as const,
    };
  }

  if (!setupDone) {
    const nextAction = agentNextAction(readiness, paired);
    const setupLabel = readiness === "offline" ? "Install helper" : readiness === "not_ready" ? "Finish setup" : "Start setup";
    const setupHref = readiness === "offline" ? "/agent#install" : "/agent";
    return {
      nextLabel: nextAction.label,
      nextHref: nextAction.href,
      steps: [
        [setupLabel, setupHref, "current"],
        ["Pair browser", "/agent#pair", "next"],
        ["Choose a video", "/analyze", "next"],
        ["Review results", "/compare", "next"],
      ] as const,
    };
  }

  if (!pairDone) {
    const nextAction = agentNextAction(readiness, paired);
    return {
      nextLabel: nextAction.label,
      nextHref: nextAction.href,
      steps: [
        ["Start setup", "/agent", "done"],
        ["Pair browser", "/agent#pair", "current"],
        ["Choose a video", "/analyze", "next"],
        ["Review results", "/compare", "next"],
      ] as const,
    };
  }

  return {
    nextLabel: "Choose a video",
    nextHref: "/analyze",
    steps: [
      ["Start setup", "/agent", "done"],
      ["Pair browser", "/agent#pair", "done"],
      ["Choose a video", "/analyze", "current"],
      ["Review results", "/compare", "next"],
    ] as const,
  };
}

export function OnboardingSteps(props: OnboardingStepsProps) {
  const { nextLabel, nextHref, steps } = stepsFor(props);
  return (
    <section className="panel" aria-labelledby="first-run-heading">
      <h2 id="first-run-heading">Your next step</h2>
      <ol className="check-list onboarding-list">
        {steps.map(([label, href, state], index) => (
          <li key={label} aria-current={state === "current" ? "step" : undefined}>
            <Link href={href}>
              {index + 1}. {label}
            </Link>
            <strong className={state === "done" ? "check-ok" : state === "current" ? "phase" : "muted"}>
              {state === "done" ? "Done" : state === "current" ? "Now" : "Next"}
            </strong>
          </li>
        ))}
      </ol>
      <Link className="d-btn d-btn-primary" href={nextHref}>
        {nextLabel} →
      </Link>
    </section>
  );
}
