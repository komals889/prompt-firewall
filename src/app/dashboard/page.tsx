"use client";
import results from "@/data/results.json";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const configs = results as any[];
const COLORS = ["#94a3b8", "#60a5fa", "#22c55e", "#f59e0b"];

const ablation = configs.map((c) => ({
  name: c.config,
  precision: c.overall.precision,
  recall: c.overall.recall,
  f1: c.overall.f1,
}));

const attacks = Object.keys(configs[0].byAttack);
const perAttack = attacks.map((a) => {
  const row: Record<string, any> = { attack: a.replace(/_/g, " ") };
  configs.forEach((c) => (row[c.config] = c.byAttack[a]?.recall ?? 0));
  return row;
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-300/40 p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-bold">Firewall evaluation</h1>
      <p className="text-sm opacity-70">
        Self-generated dataset ({configs[0].overall.n} samples). Dev set was used for tuning; test set was generated
        separately. A blind set from an independent author is reported separately.
      </p>

      <Card title="Ablation: what each layer adds">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={ablation}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="precision" fill={COLORS[1]} />
            <Bar dataKey="recall" fill={COLORS[2]} />
            <Bar dataKey="f1" fill={COLORS[3]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Recall by attack type, per layer">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={perAttack}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="attack" interval={0} angle={-20} textAnchor="end" height={70} />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Legend />
            {configs.map((c, i) => (
              <Bar key={c.config} dataKey={c.config} fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Held-out test split and false positives">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="py-1">Configuration</th><th>Test recall</th><th>Test precision</th><th>False-positive rate</th><th>LLM errors</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.config} className="border-t border-gray-300/30">
                <td className="py-1">{c.config}</td>
                <td>{c.bySplit.test.recall}</td>
                <td>{c.bySplit.test.precision}</td>
                <td>{c.overall.fpr}</td>
                <td>{c.llmErrors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}