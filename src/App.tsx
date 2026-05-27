import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import { client } from "@/lib/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type AppState = Awaited<ReturnType<typeof client.getAppState>>;
type Employee = AppState["employees"][number];
type DataEntry = AppState["dataEntries"][number];
type Issue = AppState["issues"][number];
type Role = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "COURIER";
type Mode = "RETAIL" | "BATCH";
type Section = "dashboard" | "statistics" | "batches" | "finance" | "employees" | "settings" | "logs";
type GroupBy = "day" | "week" | "month";
type DecisionKind = "RETURN" | "COUPON" | "MANUAL";
type IssueBatchForm = { courierId: string; totalBatchCost: string; warehouseWorkCost: string; fasEnabled: boolean; fasCost: string; fasPackages: string };
type DisputeRuleDraft = {
  none: boolean;
  cost: boolean;
  work: boolean;
  retail: boolean;
  retailPercentEnabled: boolean;
  retailPercent: string;
  damagePercentEnabled: boolean;
  damagePercent: string;
  fullDamage: boolean;
  manual: boolean;
};

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Супер-админ",
  ADMIN: "Админ",
  SUPPORT: "Саппорт",
  COURIER: "Курьер",
};

const modeLabels: Record<Mode, string> = {
  RETAIL: "Розница",
  BATCH: "Партии",
};

const emptyDisputeRule: DisputeRuleDraft = {
  none: false,
  cost: false,
  work: false,
  retail: false,
  retailPercentEnabled: false,
  retailPercent: "0",
  damagePercentEnabled: false,
  damagePercent: "0",
  fullDamage: false,
  manual: false,
};

const navItems: Array<{ id: Section; label: string; icon: typeof BarChart3; roles: Role[] }> = [
  { id: "dashboard", label: "Дашборд", icon: BarChart3, roles: ["SUPER_ADMIN", "ADMIN"] },
  { id: "statistics", label: "Статистика", icon: ClipboardList, roles: ["SUPER_ADMIN", "ADMIN", "SUPPORT", "COURIER"] },
  { id: "batches", label: "Партии", icon: Boxes, roles: ["SUPER_ADMIN", "ADMIN"] },
  { id: "finance", label: "Финансы", icon: CircleDollarSign, roles: ["SUPER_ADMIN", "ADMIN"] },
  { id: "employees", label: "Сотрудники", icon: Users, roles: ["SUPER_ADMIN"] },
  { id: "settings", label: "Настройки", icon: Settings, roles: ["SUPER_ADMIN"] },
  { id: "logs", label: "Логи", icon: FileClock, roles: ["SUPER_ADMIN"] },
];

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  return {
    from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function inRange(value: Date | string, from: string, to: string) {
  const time = new Date(value).getTime();
  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T23:59:59`).getTime();
  return time >= fromTime && time <= toTime;
}

function getName<T extends { id: string; name?: string; login?: string }>(items: T[], id?: string | null) {
  if (!id) return "—";
  const item = items.find((entry) => entry.id === id);
  return item?.name ?? item?.login ?? "—";
}

function parseMpDistribution(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function positiveMarketplaceNames(entry: DataEntry) {
  return Object.entries(parseMpDistribution(entry.mpDistribution))
    .filter(([, quantity]) => Number(quantity ?? 0) > 0)
    .map(([name]) => name);
}

function roleCan(role: string, section: Section) {
  return navItems.find((item) => item.id === section)?.roles.includes(role as Role) ?? false;
}

function sumEntries(entries: DataEntry[]) {
  return {
    addresses: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    grams: entries.reduce((sum, entry) => sum + entry.grossWeight, 0),
    earnings: entries.reduce((sum, entry) => sum + entry.earnings, 0),
  };
}

function getEntryPricing(state: AppState, input: { cityId: string; productId?: string; mode: Mode; weightPerAddr: number; stashTypeName: string; quantity: number }) {
  const rate = state.priceRates.find((item) => item.cityId === input.cityId && item.productId === input.productId && item.mode === input.mode && item.weight === input.weightPerAddr);
  const stash = state.stashTypes.find((item) => item.cityId === input.cityId && item.productId === input.productId && item.mode === input.mode && item.name === input.stashTypeName);
  const basePrice = rate?.price ?? 0;
  const surcharge = stash?.surcharge ?? 0;
  const unitPrice = basePrice + surcharge;
  return { rate, stash, basePrice, surcharge, unitPrice, earnings: unitPrice * input.quantity };
}

function getBatchMetrics(state: AppState, batch: AppState["batches"][number]) {
  const entries = state.dataEntries.filter((entry) => entry.batchId === batch.id);
  const byLine = entries.reduce<Record<string, { mode: string; weight: number; stashType: string; quantity: number; grams: number; earnings: number }>>((acc, entry) => {
    const key = `${entry.mode}-${entry.weightPerAddr}-${entry.stashTypeName}`;
    acc[key] ??= { mode: entry.mode, weight: entry.weightPerAddr, stashType: entry.stashTypeName, quantity: 0, grams: 0, earnings: 0 };
    acc[key].quantity += entry.quantity;
    acc[key].grams += entry.grossWeight;
    acc[key].earnings += entry.earnings;
    return acc;
  }, {});
  const totals = sumEntries(entries);
  const productCost = batch.remainingGram * batch.costPerGram;
  const fasShare = batch.fasEnabled && batch.fasCost > 0 && batch.weight > 0 ? batch.fasCost * (batch.remainingGram / batch.weight) : 0;
  return { entries, lines: Object.values(byLine), ...totals, productCost, fasShare, onHandValue: productCost };
}

function getBatchTotalCost(batch: AppState["batches"][number]) {
  return batch.totalBatchCost > 0 ? batch.totalBatchCost : batch.costPerGram * batch.weight;
}

function getBatchRealTotalCost(batch: AppState["batches"][number]) {
  return getBatchTotalCost(batch) + (batch.fasEnabled ? batch.fasCost : 0) + batch.warehouseWorkCost;
}

function getProblemNames(state: AppState, issue: Issue) {
  let ids: string[] = [];
  try {
    ids = JSON.parse(issue.problemIds) as string[];
  } catch {
    ids = [];
  }
  return ids.map((id) => state.problemTypes.find((item) => item.id === id)?.name).filter(Boolean).join(", ") || "—";
}

function getIssueLabel(issue: Issue) {
  return issue.orderNumber?.trim() || `#${issue.id.slice(0, 6)}`;
}

function getDecisionKind(decision?: AppState["decisions"][number]): DecisionKind {
  const name = decision?.name.toLowerCase() ?? "";
  if (name.includes("купон") || decision?.calcType === "PERCENT") return "COUPON";
  if (name.includes("возврат") || decision?.calcType === "COST" || decision?.calcType === "RETAIL") return "RETURN";
  return "MANUAL";
}

function normalizeDisputeRule(value: Partial<DisputeRuleDraft> | undefined, fallback: Partial<DisputeRuleDraft> = {}): DisputeRuleDraft {
  const source = { ...fallback, ...(value ?? {}) };
  return {
    none: Boolean(source.none),
    cost: Boolean(source.cost),
    work: Boolean(source.work),
    retail: Boolean(source.retail),
    retailPercentEnabled: Boolean(source.retailPercentEnabled),
    retailPercent: String(source.retailPercent ?? "0"),
    damagePercentEnabled: Boolean(source.damagePercentEnabled),
    damagePercent: String(source.damagePercent ?? "0"),
    fullDamage: Boolean(source.fullDamage),
    manual: Boolean(source.manual),
  };
}

function parseDisputeRule(value?: string | null, fallback: Partial<DisputeRuleDraft> = {}) {
  return normalizeDisputeRule(safeJson<Partial<DisputeRuleDraft>>(value ?? undefined, fallback), fallback);
}

function toApiDisputeRule(rule: DisputeRuleDraft) {
  return {
    none: rule.none,
    cost: rule.cost,
    work: rule.work,
    retail: rule.retail,
    retailPercentEnabled: rule.retailPercentEnabled,
    retailPercent: Number(rule.retailPercent || 0),
    damagePercentEnabled: rule.damagePercentEnabled,
    damagePercent: Number(rule.damagePercent || 0),
    fullDamage: rule.fullDamage,
    manual: rule.manual,
  };
}

function calculateByDisputeRule(rule: DisputeRuleDraft, input: { retailPrice: number; stashCost: number; courierWork: number; damage: number }) {
  if (rule.none || rule.manual) return 0;
  let total = 0;
  if (rule.cost) total += input.stashCost;
  if (rule.work) total += input.courierWork;
  if (rule.retail) total += input.retailPrice;
  if (rule.retailPercentEnabled) total += (input.retailPrice * Number(rule.retailPercent || 0)) / 100;
  if (rule.damagePercentEnabled) total += (input.damage * Number(rule.damagePercent || 0)) / 100;
  if (rule.fullDamage) total += input.damage;
  return total;
}

function getDisputeRuleSummary(rule: DisputeRuleDraft) {
  if (rule.manual) return "ручной режим";
  if (rule.none) return "ничего";
  const parts: string[] = [];
  if (rule.cost) parts.push("себестоимость");
  if (rule.work) parts.push("работа");
  if (rule.retail) parts.push("розница");
  if (rule.retailPercentEnabled) parts.push(`${rule.retailPercent || 0}% от розницы`);
  if (rule.damagePercentEnabled) parts.push(`${rule.damagePercent || 0}% от ущерба`);
  if (rule.fullDamage) parts.push("полный ущерб");
  return parts.join(" + ") || "не настроено";
}

function getDisputePreview(state: AppState, issue: Issue, decisionId: string, couponPercentText: string) {
  const decision = state.decisions.find((item) => item.id === decisionId);
  const decisionKind = getDecisionKind(decision);
  const entry = state.dataEntries.find((item) => item.id === issue.dataEntryId);
  const batch = state.batches.find((item) => item.id === (issue.batchId ?? entry?.batchId));
  const cityId = entry?.cityId ?? batch?.cityId;
  const productId = entry?.productId ?? batch?.productId;
  const stashTypeName = issue.stashType || entry?.stashTypeName || "";
  const rate = state.priceRates.find((item) => item.cityId === cityId && item.productId === productId && item.mode === "RETAIL" && item.weight === issue.weight);
  const stash = state.stashTypes.find((item) => item.cityId === cityId && item.productId === productId && item.mode === "RETAIL" && item.name === stashTypeName);
  const stat = state.courierStats.find((item) => item.courierId === issue.courierId);
  const statusRule = stat?.status ?? state.statusRules.find((item) => item.name === stat?.statusName);
  const returnRule = parseDisputeRule(statusRule?.returnRules, { none: true });
  const couponRule = parseDisputeRule(statusRule?.couponRules, { none: true });
  const activeRule = decisionKind === "COUPON" ? couponRule : decisionKind === "RETURN" ? returnRule : normalizeDisputeRule({ manual: true });
  const couponPercent = Number(couponPercentText || 0);
  const baseCost = (batch?.costPerGram ?? 0) * issue.weight;
  const fasCost = 0;
  const stashCost = baseCost;
  const courierWork = (rate?.price ?? 0) + (stash?.surcharge ?? 0);
  const damage = decisionKind === "COUPON" ? (issue.retailPrice * couponPercent) / 100 : issue.retailPrice;
  const manualMode = Boolean(statusRule?.manualMode) || activeRule.manual || decisionKind === "MANUAL";
  const writeOff = manualMode ? 0 : calculateByDisputeRule(activeRule, { retailPrice: issue.retailPrice, stashCost, courierWork, damage });
  return { decision, decisionKind, entry, batch, rate, stash, stat, statusRule, returnRule, couponRule, activeRule, couponPercent, baseCost, fasCost, stashCost, courierWork, damage, manualMode, writeOff };
}

function getSettlementWriteOff(state: AppState, issueId: string) {
  return state.settlementWriteOffs.find((item) => item.issueRecordId === issueId);
}

function getIssueWriteOffWithStatus(state: AppState, issue: Issue, statusRule: AppState["statusRules"][number] | undefined) {
  const decision = state.decisions.find((item) => item.id === issue.decisionId);
  const decisionKind = getDecisionKind(decision);
  const entry = state.dataEntries.find((item) => item.id === issue.dataEntryId);
  const batch = state.batches.find((item) => item.id === (issue.batchId ?? entry?.batchId));
  const cityId = entry?.cityId ?? batch?.cityId;
  const productId = entry?.productId ?? batch?.productId;
  const stashTypeName = issue.stashType || entry?.stashTypeName || "";
  const rate = state.priceRates.find((item) => item.cityId === cityId && item.productId === productId && item.mode === "RETAIL" && item.weight === issue.weight);
  const stash = state.stashTypes.find((item) => item.cityId === cityId && item.productId === productId && item.mode === "RETAIL" && item.name === stashTypeName);
  const activeRule = decisionKind === "COUPON" ? parseDisputeRule(statusRule?.couponRules, { none: true }) : decisionKind === "RETURN" ? parseDisputeRule(statusRule?.returnRules, { none: true }) : normalizeDisputeRule({ manual: true });
  const couponPercent = Number(issue.couponPercent ?? 0);
  const baseCost = (batch?.costPerGram ?? 0) * issue.weight;
  const stashCost = baseCost;
  const courierWork = (rate?.price ?? 0) + (stash?.surcharge ?? 0);
  const damage = decisionKind === "COUPON" ? (issue.retailPrice * couponPercent) / 100 : issue.retailPrice;
  const manualMode = Boolean(statusRule?.manualMode) || activeRule.manual || decisionKind === "MANUAL";
  const writeOff = manualMode ? 0 : calculateByDisputeRule(activeRule, { retailPrice: issue.retailPrice, stashCost, courierWork, damage });
  return { writeOff, activeRule, decision, decisionKind, stashCost, courierWork, damage, manualMode };
}

function DetailItem({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-lg font-semibold">{value}</div>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "info",
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: "info" | "success" | "warn" | "danger";
}) {
  const toneClass = {
    info: "from-blue-500/20 to-violet-500/8 text-blue-500",
    success: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
    warn: "from-amber-500/20 to-orange-500/5 text-amber-500",
    danger: "from-red-500/20 to-red-500/5 text-red-500",
  }[tone];

  return (
    <Card className="rounded-[20px] border-border/70 bg-card/90 shadow-xl shadow-slate-950/5 backdrop-blur dark:shadow-black/20">
      <CardContent className="p-5">
        <div className={`mb-4 h-1.5 w-16 rounded-full bg-gradient-to-r ${toneClass}`} />
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
        <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ActionDialog({
  title,
  description,
  trigger,
  children,
  contentClassName = "sm:max-w-5xl",
}: {
  title: string;
  description?: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`max-h-[90vh] overflow-y-auto rounded-[20px] ${contentClassName}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ACTIVE" || status === "ISSUED" || status === "OPEN"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "CLOSED" || status === "INACTIVE"
        ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
        : "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400";
  const labels: Record<string, string> = {
    ACTIVE: "Активен",
    INACTIVE: "Не активен",
    NEW: "Новая",
    ISSUED: "Выдана",
    CLOSED: "Закрыта",
    OPEN: "Открыт",
    PENDING: "В обработке",
    DONE: "Готово",
  };
  return (
    <Badge variant="outline" className={`rounded-full ${className}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

function LoginScreen({ onLogin }: { onLogin: (employee: Employee) => void }) {
  const [login, setLogin] = useState("Rick");
  const [password, setPassword] = useState("SuperRick");
  const mutation = useMutation({
    mutationFn: () => client.loginEmployee({ login, password }),
    onSuccess: (employee) => {
      localStorage.setItem("rick-crm-session", JSON.stringify(employee));
      onLogin(employee);
      toast.success("Вход выполнен");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,.12),transparent_30%)] px-5 py-10 text-foreground">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <Card className="w-full max-w-xl rounded-[28px] border-border/70 bg-card/90 shadow-2xl shadow-slate-950/10 backdrop-blur dark:shadow-black/30">
          <CardHeader className="space-y-4 p-8">
            <Badge className="w-fit rounded-full bg-blue-500/10 px-4 py-1.5 text-blue-500 hover:bg-blue-500/10">Rick CRM</Badge>
            <div>
              <CardTitle className="text-4xl font-semibold tracking-tight">Вход в систему</CardTitle>
              <p className="mt-3 text-base text-muted-foreground">Первый супер-админ: Rick / SuperRick.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-8 pt-0">
            <a
              href="https://t.me/miraa_boom"
              target="_blank"
              rel="noreferrer"
              className="block rounded-[24px] border border-blue-500/30 bg-blue-500/10 p-5 text-center shadow-lg shadow-blue-500/10 transition duration-300 hover:-translate-y-0.5 hover:bg-blue-500/15"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-500">ЖДУ СВЯЗИ</p>
              <p className="mt-3 break-words text-3xl font-black uppercase tracking-tight text-blue-600 dark:text-blue-300 sm:text-4xl">
                TG: @MIRAA_BOOM
              </p>
            </a>
            <Field label="Логин">
              <Input className="h-12 rounded-xl text-base" value={login} onChange={(event) => setLogin(event.target.value)} autoCapitalize="off" spellCheck={false} />
            </Field>
            <Field label="Пароль">
              <Input className="h-12 rounded-xl text-base" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button className="h-12 w-full rounded-xl text-base transition duration-300" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Проверка..." : "Войти"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Toaster richColors position="top-right" />
    </main>
  );
}

type MiniPoint = { key: string; addresses?: number; grams?: number; earnings?: number; disputes?: number; tickets?: number; writeOff?: number };

function shortDateLabel(key: string) {
  const parts = key.split("-");
  if (parts.length === 2) return `${parts[1]}.${parts[0].slice(2)}`;
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  return key;
}

function presetRange(preset: "7" | "30" | "month" | "all") {
  if (preset === "month") return currentMonthRange();
  if (preset === "all") return { from: "2020-01-01", to: toDateInput(new Date()) };
  const days = Number(preset);
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days + 1);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">{label}</TableCell></TableRow>;
}

function TrendBars({ data, metric, tone = "blue" }: { data: MiniPoint[]; metric: keyof MiniPoint; tone?: "blue" | "green" | "amber" | "red" }) {
  const values = data.map((point) => Number(point[metric] ?? 0));
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const color = {
    blue: "from-blue-600 to-violet-400",
    green: "from-emerald-600 to-teal-400",
    amber: "from-amber-500 to-orange-400",
    red: "from-red-600 to-rose-400",
  }[tone];
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex h-56 items-end gap-2">
        {data.length === 0 && <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Нет данных за период</div>}
        {data.map((point) => {
          const value = Number(point[metric] ?? 0);
          const height = Math.max(4, Math.round((Math.abs(value) / max) * 100));
          return (
            <div key={point.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className={`w-full rounded-t-xl bg-gradient-to-t ${color} shadow-sm transition hover:opacity-80`} style={{ height: `${height}%` }} title={`${shortDateLabel(point.key)}: ${formatNumber(value)}`} />
              <span className="max-w-full truncate text-[10px] text-muted-foreground">{shortDateLabel(point.key)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBars({ rows, valueKey, labelKey, format = String, tone = "blue" }: { rows: Array<Record<string, string | number>>; valueKey: string; labelKey: string; format?: (value: number) => string; tone?: "blue" | "green" | "amber" | "red" }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] ?? 0)));
  const color = { blue: "bg-blue-500", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="rounded-2xl border bg-muted/20 p-5 text-center text-sm text-muted-foreground">Нет данных</p>}
      {rows.map((row) => {
        const value = Number(row[valueKey] ?? 0);
        return (
          <div key={String(row[labelKey])} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{row[labelKey]}</span><span className="text-muted-foreground">{format(value)}</span></div>
            <div className="h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const initialRange = currentMonthRange();
  const [period, setPeriod] = useState(initialRange);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [mpFilter, setMpFilter] = useState("ALL");
  const analyticsQuery = useQuery({
    queryKey: ["dashboardAnalytics", currentUser.login, period, groupBy, mpFilter],
    queryFn: () => client.getDashboardAnalytics({ actorLogin: currentUser.login, from: period.from, to: period.to, groupBy, marketplace: mpFilter }),
  });
  const analytics = analyticsQuery.data;
  const summary = analytics?.summary;
  const marketplaceRows = analytics?.marketplaceRows ?? [];
  const courierRows = analytics?.courierRows ?? [];
  const topCouriers = [...courierRows].sort((a, b) => b.addresses - a.addresses).slice(0, 6);
  const riskCouriers = [...courierRows].sort((a, b) => b.disputePercent - a.disputePercent || b.disputes - a.disputes).slice(0, 6);
  const marketplaceCompare = marketplaceRows.slice(0, 8).map((row) => ({ name: row.name, addresses: row.addresses, disputes: row.disputes, earnings: row.earnings }));
  const ledgerRows = Object.entries(analytics?.finance.ledgerByType ?? {}).map(([name, value]) => ({ name, value: Math.abs(value) })).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <Card className="rounded-[24px] border-border/70 bg-card/90">
        <CardContent className="grid gap-4 p-5 xl:grid-cols-[1fr_1fr_170px_220px_auto]">
          <Field label="Дата от"><Input className="h-11 rounded-xl text-base" type="date" value={period.from} onChange={(event) => setPeriod((value) => ({ ...value, from: event.target.value }))} /></Field>
          <Field label="Дата до"><Input className="h-11 rounded-xl text-base" type="date" value={period.to} onChange={(event) => setPeriod((value) => ({ ...value, to: event.target.value }))} /></Field>
          <Field label="Группировка"><Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}><TabsList className="h-11 rounded-xl"><TabsTrigger value="day">День</TabsTrigger><TabsTrigger value="week">Неделя</TabsTrigger><TabsTrigger value="month">Месяц</TabsTrigger></TabsList></Tabs></Field>
          <Field label="Маркетплейс"><Select value={mpFilter} onValueChange={setMpFilter}><SelectTrigger className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Все МП</SelectItem>{state.marketplaces.map((mp) => <SelectItem key={mp.id} value={mp.name}>{mp.name}</SelectItem>)}</SelectContent></Select></Field>
          <div className="flex flex-wrap items-end gap-2"><Button variant="outline" className="rounded-xl" onClick={() => setPeriod(presetRange("7"))}>7 дней</Button><Button variant="outline" className="rounded-xl" onClick={() => setPeriod(presetRange("30"))}>30 дней</Button><Button variant="outline" className="rounded-xl" onClick={() => setPeriod(presetRange("month"))}>Месяц</Button><Button variant="outline" className="rounded-xl" onClick={() => setPeriod(presetRange("all"))}>Всё</Button></div>
        </CardContent>
      </Card>

      {analyticsQuery.isError && <Card className="rounded-[20px] border-red-500/40"><CardContent className="p-5 text-red-500">Ошибка аналитики: {analyticsQuery.error.message}</CardContent></Card>}
      {analyticsQuery.isPending && <Card className="rounded-[20px]"><CardContent className="p-5 text-muted-foreground">Собираю аналитику...</CardContent></Card>}

      {analytics && summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Адреса" value={summary.addresses} hint="клады/адреса по вводу" tone="info" />
            <MetricCard label="Граммы" value={formatNumber(summary.grams)} hint="расход за период" tone="success" />
            <MetricCard label="Заработок" value={formatMoney(summary.earnings)} hint="по строкам статистики" tone="success" />
            <MetricCard label="Диспуты" value={`${summary.disputes} / ${summary.openDisputes}`} hint="всего / открыто" tone={summary.openDisputes > 0 ? "warn" : "info"} />
            <MetricCard label="% диспутов" value={`${summary.disputePercent.toFixed(2)}%`} hint="диспуты / адреса" tone={summary.disputePercent > 10 ? "danger" : "success"} />
            <MetricCard label="Списания" value={formatMoney(summary.writeOff)} hint="диспуты + штрафы" tone={summary.writeOff > 0 ? "danger" : "info"} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
            <Card className="rounded-[24px]"><CardHeader><CardTitle>Динамика периода</CardTitle><p className="text-sm text-muted-foreground">Адреса, выручка, диспуты и списания по выбранной группировке.</p></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Адреса</p><TrendBars data={analytics.timeline} metric="addresses" tone="blue" /></div><div><p className="mb-2 text-sm font-medium">Заработок</p><TrendBars data={analytics.timeline} metric="earnings" tone="green" /></div><div><p className="mb-2 text-sm font-medium">Диспуты</p><TrendBars data={analytics.timeline} metric="disputes" tone="amber" /></div><div><p className="mb-2 text-sm font-medium">Списания</p><TrendBars data={analytics.timeline} metric="writeOff" tone="red" /></div></CardContent></Card>
            <Card className="rounded-[24px]"><CardHeader><CardTitle>Финансовая структура</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3"><MetricCard label="Доходы ledger" value={formatMoney(analytics.finance.income)} hint="положительные движения" tone="success" /><MetricCard label="Расходы ledger" value={formatMoney(analytics.finance.expense)} hint="отрицательные движения" tone="danger" /></div><HorizontalBars rows={ledgerRows} valueKey="value" labelKey="name" format={formatMoney} tone="green" /></CardContent></Card>
          </div>

          <Card className="rounded-[24px]">
            <CardHeader><CardTitle>Маркетплейсы: общая картина и каждый МП отдельно</CardTitle><p className="text-sm text-muted-foreground">Сравнение адресов, сумм, диспутов и процента проблемности.</p></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-2"><HorizontalBars rows={marketplaceCompare} valueKey="addresses" labelKey="name" format={(value) => `${formatNumber(value)} адресов`} tone="blue" /><HorizontalBars rows={marketplaceCompare} valueKey="earnings" labelKey="name" format={formatMoney} tone="green" /></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {marketplaceRows.map((mp) => <Card key={mp.name} className="rounded-2xl bg-muted/20"><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{mp.name}</p><p className="text-xs text-muted-foreground">{mp.status === "ACTIVE" ? "активен" : mp.status === "INACTIVE" ? "отключён" : "из истории"}</p></div><Badge variant="outline" className="rounded-full">{mp.disputePercent.toFixed(2)}%</Badge></div><div className="grid grid-cols-2 gap-2 text-sm"><DetailItem label="Адреса" value={mp.addresses} /><DetailItem label="Сумма" value={formatMoney(mp.earnings)} /><DetailItem label="Диспуты" value={`${mp.disputes} / ${mp.openDisputes}`} hint="всего / открыто" /><DetailItem label="Списания" value={formatMoney(mp.writeOff)} /></div></CardContent></Card>)}
                {marketplaceRows.length === 0 && <p className="text-sm text-muted-foreground">По МП нет данных.</p>}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="rounded-[24px]"><CardHeader><CardTitle>Курьеры: топ активности</CardTitle></CardHeader><CardContent className="overflow-hidden rounded-2xl border p-0"><Table><TableHeader><TableRow><TableHead>Курьер</TableHead><TableHead>Адреса</TableHead><TableHead>Диспуты</TableHead><TableHead>%</TableHead><TableHead>Статус</TableHead><TableHead>Списания</TableHead></TableRow></TableHeader><TableBody>{topCouriers.map((row) => <TableRow key={row.courierId}><TableCell className="font-medium">{row.login}</TableCell><TableCell>{row.addresses}</TableCell><TableCell>{row.disputes}</TableCell><TableCell>{row.disputePercent.toFixed(2)}%</TableCell><TableCell><Badge variant="outline" className="rounded-full">{row.statusName}</Badge></TableCell><TableCell>{formatMoney(row.writeOff)}</TableCell></TableRow>)}{topCouriers.length === 0 && <EmptyRow colSpan={6} label="Нет активности курьеров" />}</TableBody></Table></CardContent></Card>
            <Card className="rounded-[24px]"><CardHeader><CardTitle>Курьеры: риск/анти-топ</CardTitle></CardHeader><CardContent className="space-y-4"><HorizontalBars rows={riskCouriers.map((row) => ({ name: row.login, value: row.disputePercent }))} valueKey="value" labelKey="name" format={(value) => `${value.toFixed(2)}%`} tone="red" /><div className="grid gap-3 md:grid-cols-3"><MetricCard label="Активных курьеров" value={summary.activeCouriers} hint="есть ввод за период" tone="info" /><MetricCard label="Банк курьеров" value={formatMoney(analytics.finance.balances.bank)} hint="текущий баланс" tone="success" /><MetricCard label="Залог курьеров" value={formatMoney(analytics.finance.balances.deposit)} hint="текущий баланс" tone="success" /></div></CardContent></Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
            <Card className="rounded-[24px]"><CardHeader><CardTitle>Ввод данных и партии</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><MetricCard label="Строк статистики" value={summary.entries} hint="добавлено за период" tone="info" /><MetricCard label="Партий создано" value={summary.batches} hint="создание партии" tone="info" /><MetricCard label="Непроведённые финансы" value={analytics.dataQuality.unprocessedFinanceRows} hint="строки в обработке" tone={analytics.dataQuality.unprocessedFinanceRows > 0 ? "warn" : "success"} /><MetricCard label="Пустые МП-строки" value={analytics.dataQuality.zeroMpEntries} hint="распределение МП = 0" tone={analytics.dataQuality.zeroMpEntries > 0 ? "danger" : "success"} /></CardContent></Card>
            <Card className="rounded-[24px]"><CardHeader><CardTitle>Диспуты: причины, решения, режимы</CardTitle></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2"><div><p className="mb-3 text-sm font-medium">Причины/проблемы</p><HorizontalBars rows={analytics.disputes.problemRows.map((row) => ({ name: row.name, value: row.count }))} valueKey="value" labelKey="name" format={(value) => `${value}`} tone="amber" /></div><div><p className="mb-3 text-sm font-medium">Решения и списания</p><HorizontalBars rows={analytics.disputes.decisionRows.map((row) => ({ name: row.name, value: row.count }))} valueKey="value" labelKey="name" format={(value) => `${value}`} tone="blue" /></div><div className="lg:col-span-2 grid gap-3 md:grid-cols-4"><MetricCard label="Закрытые" value={summary.closedDisputes} hint="диспуты закрыты" tone="success" /><MetricCard label="Открытые" value={summary.openDisputes} hint="требуют внимания" tone={summary.openDisputes > 0 ? "warn" : "success"} /><MetricCard label="Авто расчёт" value={analytics.disputes.autoDisputes} hint="закрыто автоматически" tone="info" /><MetricCard label="Ручной режим" value={analytics.disputes.manualDisputes} hint="через штраф" tone="warn" /></div></CardContent></Card>
          </div>
        </>
      )}
    </div>
  );
}

function CourierTable({ rows, showMoney, state }: { rows: Array<{ employee: Employee; addresses: number; disputes: number; disputePercent: number; statusName: string }>; showMoney: boolean; state: AppState }) {
  const [selectedCourier, setSelectedCourier] = useState<Employee | null>(null);
  return (
    <>
      <div className="overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Курьер</TableHead>
              <TableHead>Адреса</TableHead>
              <TableHead>Диспуты</TableHead>
              <TableHead>% диспутов</TableHead>
              <TableHead>Статус</TableHead>
              {showMoney && <TableHead>Банк</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.employee.id} className="cursor-pointer transition duration-200 hover:bg-muted/70" onClick={() => setSelectedCourier(row.employee)}>
                <TableCell className="font-medium">{row.employee.login}</TableCell>
                <TableCell>{row.addresses}</TableCell>
                <TableCell>{row.disputes}</TableCell>
                <TableCell>{row.disputePercent.toFixed(2)}%</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full">{row.statusName}</Badge>
                </TableCell>
                {showMoney && <TableCell>{formatMoney(row.employee.bankBalance)}</TableCell>}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={showMoney ? 6 : 5} className="py-8 text-center text-muted-foreground">Курьеры не найдены</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={Boolean(selectedCourier)} onOpenChange={(open) => !open && setSelectedCourier(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[20px] sm:max-w-5xl">
          <DialogHeader><DialogTitle>Подробности курьера: {selectedCourier?.login}</DialogTitle><DialogDescription>Партии на руках, тикеты/диспуты, заработок, балансы и статус.</DialogDescription></DialogHeader>
          {selectedCourier && <CourierDetails state={state} courier={selectedCourier} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type DataEntryRowDraft = { id: string; mode: Mode; weightPerAddr: string; stashTypeName: string; quantity: string; mpValues: Record<string, string> };

function DataEntryForm({ state, currentUser, editing }: { state: AppState; currentUser: Employee; editing?: DataEntry }) {
  const queryClient = useQueryClient();
  const couriers = state.employees.filter((employee) => employee.role === "COURIER");
  const initialMp = editing ? Object.fromEntries(Object.entries(parseMpDistribution(editing.mpDistribution)).map(([key, value]) => [key, String(value)])) : {};
  const [form, setForm] = useState({
    courierId: editing?.courierId ?? couriers[0]?.id ?? "",
    batchId: editing?.batchId ?? "",
    cityId: editing?.cityId ?? state.cities[0]?.id ?? "",
  });
  const [rows, setRows] = useState<DataEntryRowDraft[]>([
    {
      id: editing?.id ?? "row-1",
      mode: (editing?.mode as Mode | undefined) ?? "RETAIL",
      weightPerAddr: String(editing?.weightPerAddr ?? 1),
      stashTypeName: editing?.stashTypeName ?? "Розница Тип-1",
      quantity: String(editing?.quantity ?? 1),
      mpValues: initialMp,
    },
  ]);
  const activeMps = state.marketplaces.filter((mp) => mp.status === "ACTIVE" || initialMp[mp.name]);
  const availableBatches = state.batches.filter((batch) => batch.courierId === form.courierId && batch.status === "ISSUED");
  const selectedBatch = state.batches.find((batch) => batch.id === form.batchId);
  const rowCalculations = rows.map((row) => {
    const quantity = Number(row.quantity || 0);
    const weightPerAddr = Number(row.weightPerAddr || 0);
    const totalMp = Object.values(row.mpValues).reduce((sum, value) => sum + Number(value || 0), 0);
    const pricing = getEntryPricing(state, { cityId: form.cityId, productId: selectedBatch?.productId, mode: row.mode, weightPerAddr, stashTypeName: row.stashTypeName, quantity });
    return { rowId: row.id, quantity, weightPerAddr, totalMp, grossWeight: quantity * weightPerAddr, ...pricing };
  });
  const totalEarnings = rowCalculations.reduce((sum, item) => sum + item.earnings, 0);
  const totalGrossWeight = rowCalculations.reduce((sum, item) => sum + item.grossWeight, 0);
  const mutation = useMutation({
    mutationFn: async () => {
      for (const row of rows) {
        const payload = {
          actorLogin: currentUser.login,
          courierId: form.courierId,
          batchId: form.batchId,
          cityId: form.cityId,
          mode: row.mode,
          weightPerAddr: Number(row.weightPerAddr),
          stashTypeName: row.stashTypeName,
          quantity: Number(row.quantity),
          mpDistribution: Object.fromEntries(activeMps.map((mp) => [mp.name, Number(row.mpValues[mp.name] || 0)])),
        };
        if (editing) await client.editDataEntry({ id: editing.id, ...payload });
        else await client.createDataEntry(payload);
      }
      return { success: true };
    },
    onSuccess: () => {
      toast.success(editing ? "Ввод пересчитан" : `Сохранено строк: ${rows.length}`);
      queryClient.invalidateQueries({ queryKey: ["appState"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const updateRow = (rowId: string, patch: Partial<DataEntryRowDraft>) => setRows((items) => items.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Курьер">
          <Select value={form.courierId} onValueChange={(value) => setForm((item) => ({ ...item, courierId: value, batchId: "" }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите курьера" /></SelectTrigger>
            <SelectContent>{couriers.map((courier) => <SelectItem key={courier.id} value={courier.id}>{courier.login}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Партия">
          <Select value={form.batchId} onValueChange={(value) => setForm((item) => ({ ...item, batchId: value }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите партию" /></SelectTrigger>
            <SelectContent>{availableBatches.map((batch) => <SelectItem key={batch.id} value={batch.id}>{batch.name} · остаток {formatNumber(batch.remainingGram)} г</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Город">
          <Select value={form.cityId} onValueChange={(value) => setForm((item) => ({ ...item, cityId: value }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger>
            <SelectContent>{state.cities.filter((city) => city.status === "ACTIVE").map((city) => <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <div className="space-y-4">
        {rows.map((row, index) => {
          const calculation = rowCalculations.find((item) => item.rowId === row.id);
          const stashTypes = state.stashTypes.filter((item) => item.cityId === form.cityId && item.productId === selectedBatch?.productId && item.mode === row.mode);
          const mpMismatch = calculation?.totalMp !== calculation?.quantity;
          return (
            <div key={row.id} className="rounded-2xl border bg-muted/20 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Строка {index + 1}</p>
                  <p className="text-sm text-muted-foreground">Вес, тип, количество и распределение по МП вводятся отдельно по каждой строке.</p>
                </div>
                {!editing && rows.length > 1 && <Button variant="outline" className="rounded-xl" onClick={() => setRows((items) => items.filter((item) => item.id !== row.id))}>Убрать строку</Button>}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Режим">
                  <Select value={row.mode} onValueChange={(value) => updateRow(row.id, { mode: value as Mode, stashTypeName: value === "RETAIL" ? "Розница Тип-1" : "Партия Тип-1" })}>
                    <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="RETAIL">Розница</SelectItem><SelectItem value="BATCH">Партии</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Вес одного адреса"><Input className="h-11 rounded-xl text-base" inputMode="decimal" value={row.weightPerAddr} onChange={(event) => updateRow(row.id, { weightPerAddr: event.target.value })} /></Field>
                <Field label="Количество адресов" hint={`Распределено по МП: ${calculation?.totalMp ?? 0}` }><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} /></Field>
                <Field label="Тип клада">
                  <Select value={row.stashTypeName} onValueChange={(value) => updateRow(row.id, { stashTypeName: value })}>
                    <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                    <SelectContent>{stashTypes.map((type) => <SelectItem key={type.id} value={type.name}>{type.name} · +{formatMoney(type.surcharge)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-4 rounded-2xl border bg-background/60 p-4">
                <p className="mb-3 text-sm font-medium">Распределение по МП</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {activeMps.map((mp) => (
                    <Field key={mp.id} label={mp.name}>
                      <Input className="h-11 rounded-xl text-base" inputMode="numeric" value={row.mpValues[mp.name] ?? ""} onChange={(event) => updateRow(row.id, { mpValues: { ...row.mpValues, [mp.name]: event.target.value } })} />
                    </Field>
                  ))}
                </div>
                {mpMismatch && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">Количество по МП должно быть ровно равно количеству адресов.</p>}
              </div>
              <div className="mt-4 grid gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 md:grid-cols-4">
                <DetailItem label="Цена" value={formatMoney(calculation?.basePrice ?? 0)} hint="из настроек города" />
                <DetailItem label="Надбавка" value={formatMoney(calculation?.surcharge ?? 0)} hint={row.stashTypeName} />
                <DetailItem label="Вес строки" value={`${formatNumber(calculation?.grossWeight ?? 0)} г`} hint={`${calculation?.quantity ?? 0} × ${formatNumber(calculation?.weightPerAddr ?? 0)} г`} />
                <DetailItem label="Заработок строки" value={formatMoney(calculation?.earnings ?? 0)} hint={`(${formatMoney(calculation?.unitPrice ?? 0)}) × ${calculation?.quantity ?? 0}`} />
              </div>
            </div>
          );
        })}
        {!editing && <Button variant="outline" className="w-fit rounded-xl" onClick={() => setRows((items) => [...items, { id: `row-${Date.now()}`, mode: "RETAIL", weightPerAddr: "1", stashTypeName: "Розница Тип-1", quantity: "1", mpValues: {} }])}>Добавить строку</Button>}
      </div>
      <div className="grid gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:grid-cols-3">
        <DetailItem label="Итого строк" value={rows.length} hint="будут сохранены последовательно" />
        <DetailItem label="Итого вес" value={`${formatNumber(totalGrossWeight)} г`} hint={`остаток партии: ${formatNumber(selectedBatch?.remainingGram ?? 0)} г`} />
        <DetailItem label="Итого заработок" value={formatMoney(totalEarnings)} hint="расчёт до сохранения" />
      </div>
      <DialogFooter>
        <Button className="h-11 rounded-xl" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{editing ? "Сохранить и пересчитать" : "Сохранить ввод"}</Button>
      </DialogFooter>
    </div>
  );
}

function IssueForm({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const couriers = state.employees.filter((employee) => employee.role === "COURIER");
  const activeMarketplaceNames = state.marketplaces.filter((mp) => mp.status === "ACTIVE").map((mp) => mp.name);
  const firstCourierId = couriers[0]?.id ?? "";
  const firstBatch = state.batches.find((batch) => batch.status === "ISSUED" && batch.courierId === firstCourierId);
  const buildIssueDefaults = (courierId: string, batchId?: string) => {
    const batch = batchId
      ? state.batches.find((item) => item.id === batchId)
      : state.batches.find((item) => item.status === "ISSUED" && item.courierId === courierId);
    const entry = state.dataEntries.find((item) => item.courierId === courierId && item.batchId === batch?.id);
    const entryMarketplace = entry ? positiveMarketplaceNames(entry).find((name) => activeMarketplaceNames.includes(name)) ?? positiveMarketplaceNames(entry)[0] : undefined;
    return {
      batchId: batch?.id ?? "",
      cityId: entry?.cityId ?? batch?.cityId ?? state.cities.find((city) => city.status === "ACTIVE")?.id ?? "",
      productId: entry?.productId ?? batch?.productId ?? state.products[0]?.id ?? "",
      weight: String(entry?.weightPerAddr ?? 1),
      marketplace: entryMarketplace ?? activeMarketplaceNames[0] ?? "",
      stashType: entry?.stashTypeName ?? "",
    };
  };
  const initialDefaults = buildIssueDefaults(firstCourierId, firstBatch?.id);
  const [form, setForm] = useState({ kind: "TICKET", orderNumber: "", courierId: firstCourierId, ...initialDefaults, retailPrice: "0", otherText: "" });
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const courierBatches = state.batches.filter((batch) => batch.status === "ISSUED" && batch.courierId === form.courierId);
  const selectedBatch = state.batches.find((batch) => batch.id === form.batchId);
  const productId = selectedBatch?.productId ?? form.productId;
  const batchEntries = state.dataEntries.filter((entry) => entry.courierId === form.courierId && entry.batchId === form.batchId);
  const cityIdsWithEntries = new Set(batchEntries.map((entry) => entry.cityId));
  const cityOptions = state.cities.filter((city) => city.status === "ACTIVE" || cityIdsWithEntries.has(city.id)).filter((city) => cityIdsWithEntries.size === 0 || cityIdsWithEntries.has(city.id));
  const marketplaceNamesWithEntries = new Set(batchEntries.flatMap(positiveMarketplaceNames));
  const marketplaceOptions = Array.from(new Set([...activeMarketplaceNames, ...marketplaceNamesWithEntries])).filter((name) => !marketplaceNamesWithEntries.size || marketplaceNamesWithEntries.has(name));
  const configuredStashTypes = state.stashTypes.filter((type) => type.cityId === form.cityId && type.productId === productId && type.mode === "RETAIL").map((type) => type.name);
  const entryStashTypes = batchEntries.filter((entry) => entry.cityId === form.cityId && entry.productId === productId).map((entry) => entry.stashTypeName);
  const stashTypeNames = Array.from(new Set([...configuredStashTypes, ...entryStashTypes]));
  const allocationPreview = state.dataEntries
    .filter((entry) => entry.courierId === form.courierId && entry.batchId === form.batchId && entry.cityId === form.cityId && entry.productId === productId && Math.abs(entry.weightPerAddr - Number(form.weight)) <= 0.000001 && entry.stashTypeName.trim() === form.stashType.trim() && Number(parseMpDistribution(entry.mpDistribution)[form.marketplace] ?? 0) > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((entry) => {
      const marketplaceQuantity = Number(parseMpDistribution(entry.mpDistribution)[form.marketplace] ?? 0);
      const used = state.issues.filter((issue) => issue.dataEntryId === entry.id && issue.marketplace === form.marketplace).length;
      return { entry, marketplaceQuantity, used, free: marketplaceQuantity - used };
    })
    .find((item) => item.free > 0);
  const mutation = useMutation({
    mutationFn: () => client.openIssue({
      actorLogin: currentUser.login,
      kind: form.kind as "TICKET" | "DISPUTE",
      orderNumber: form.orderNumber,
      courierId: form.courierId,
      batchId: form.batchId,
      cityId: form.cityId,
      productId,
      weight: Number(form.weight),
      marketplace: form.marketplace,
      stashType: form.stashType,
      retailPrice: Number(form.retailPrice),
      problemIds: selectedProblems,
      otherText: form.otherText,
    }),
    onSuccess: () => {
      toast.success("Запись открыта");
      queryClient.invalidateQueries({ queryKey: ["appState"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Тип">
          <Select value={form.kind} onValueChange={(value) => setForm((item) => ({ ...item, kind: value }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TICKET">Тикет</SelectItem><SelectItem value="DISPUTE">Диспут</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Номер заказа / имя диспута" hint="Свободная метка: будет видна в списке и доступна в поиске."><Input className="h-11 rounded-xl text-base" placeholder="Например: 12345 / OZON-778" value={form.orderNumber} onChange={(event) => setForm((item) => ({ ...item, orderNumber: event.target.value }))} /></Field>
        <Field label="Курьер">
          <Select value={form.courierId} onValueChange={(value) => setForm((item) => ({ ...item, courierId: value, ...buildIssueDefaults(value), }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger>
            <SelectContent>{couriers.map((courier) => <SelectItem key={courier.id} value={courier.id}>{courier.login}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Партия" hint="Только выданные партии выбранного курьера.">
          <Select value={form.batchId} onValueChange={(value) => setForm((item) => ({ ...item, ...buildIssueDefaults(item.courierId, value) }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите партию" /></SelectTrigger>
            <SelectContent>{courierBatches.map((batch) => <SelectItem key={batch.id} value={batch.id}>{batch.name} · {getName(state.products, batch.productId)} · остаток {formatNumber(batch.remainingGram)} г</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Город" hint={batchEntries.length > 0 ? "Показаны города, где есть вводы данных по выбранной партии." : undefined}><Select value={form.cityId} onValueChange={(value) => { const entry = batchEntries.find((item) => item.cityId === value && item.productId === productId); const entryMarketplace = entry ? positiveMarketplaceNames(entry).find((name) => marketplaceOptions.includes(name)) ?? positiveMarketplaceNames(entry)[0] : undefined; setForm((item) => ({ ...item, cityId: value, weight: String(entry?.weightPerAddr ?? item.weight), marketplace: entryMarketplace ?? item.marketplace, stashType: entry?.stashTypeName ?? "" })); }}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{cityOptions.map((city) => <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Товар"><Select value={productId} onValueChange={(value) => setForm((item) => ({ ...item, productId: value, stashType: "" }))} disabled={Boolean(selectedBatch)}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{state.products.filter((product) => product.status === "ACTIVE").map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="МП">
          <Select value={form.marketplace} onValueChange={(value) => setForm((item) => ({ ...item, marketplace: value }))}>
            <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите МП" /></SelectTrigger>
            <SelectContent>{marketplaceOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Вес"><Input className="h-11 rounded-xl text-base" inputMode="decimal" value={form.weight} onChange={(event) => setForm((item) => ({ ...item, weight: event.target.value }))} /></Field>
        <Field label="Тип клада"><Select value={form.stashType} onValueChange={(value) => setForm((item) => ({ ...item, stashType: value }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите тип" /></SelectTrigger><SelectContent>{stashTypeNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Розничная цена"><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={form.retailPrice} onChange={(event) => setForm((item) => ({ ...item, retailPrice: event.target.value }))} /></Field>
      </div>
      <div className={`rounded-2xl border p-4 text-sm ${allocationPreview ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
        {allocationPreview ? `Найдено свободных адресов: ${allocationPreview.free}. CRM привяжет самый старый подходящий ввод от ${formatDate(allocationPreview.entry.createdAt)}.` : "Свободный адрес по выбранной партии и параметрам пока не найден."}
        {selectedBatch && <span className="mt-1 block text-muted-foreground">Цена товара: {formatMoney(getBatchTotalCost(selectedBatch))} · реальная себестоимость {formatMoney(selectedBatch.costPerGram)} за 1 г. ФАС: {selectedBatch.fasEnabled ? formatMoney(selectedBatch.fasCost) : "не включён"}; работа склада: {formatMoney(selectedBatch.warehouseWorkCost)}.</span>}
      </div>
      <div className="grid gap-2 rounded-2xl border bg-muted/30 p-4">
        <p className="text-sm font-medium">Типы проблем</p>
        <div className="flex flex-wrap gap-2">
          {state.problemTypes.map((problem) => (
            <Button key={problem.id} type="button" variant={selectedProblems.includes(problem.id) ? "default" : "outline"} className="rounded-xl" onClick={() => setSelectedProblems((items) => items.includes(problem.id) ? items.filter((id) => id !== problem.id) : [...items, problem.id])}>{problem.name}</Button>
          ))}
        </div>
      </div>
      <Field label="Другое"><Textarea className="rounded-xl text-base" value={form.otherText} onChange={(event) => setForm((item) => ({ ...item, otherText: event.target.value }))} /></Field>
      <DialogFooter><Button className="rounded-xl" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Открыть</Button></DialogFooter>
    </div>
  );
}

function CloseDisputeForm({ state, currentUser, issue }: { state: AppState; currentUser: Employee; issue: Issue }) {
  const queryClient = useQueryClient();
  const [decisionId, setDecisionId] = useState(state.decisions.find((item) => getDecisionKind(item) === "RETURN")?.id ?? state.decisions[0]?.id ?? "");
  const [couponPercent, setCouponPercent] = useState("50");
  const preview = getDisputePreview(state, issue, decisionId, couponPercent);
  const mutation = useMutation({
    mutationFn: () => client.closeDispute({ actorLogin: currentUser.login, issueId: issue.id, decisionId, couponPercent: preview.decisionKind === "COUPON" ? Number(couponPercent) : undefined }),
    onSuccess: () => {
      toast.success("Диспут закрыт");
      queryClient.invalidateQueries({ queryKey: ["appState"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="grid gap-4">
      <Field label="Решение диспута">
        <Select value={decisionId} onValueChange={setDecisionId}>
          <SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Выберите решение" /></SelectTrigger>
          <SelectContent>{state.decisions.map((decision) => <SelectItem key={decision.id} value={decision.id}>{decision.name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {preview.decisionKind === "COUPON" && (
        <Field label="Процент купона" hint="От 1% до 100%; ущерб считается от розничной цены.">
          <Input className="h-11 rounded-xl text-base" inputMode="numeric" value={couponPercent} onChange={(event) => setCouponPercent(event.target.value)} />
        </Field>
      )}
      <div className="space-y-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div>
          <p className="text-sm font-semibold">Расчёт списания</p>
          <p className="text-sm text-muted-foreground">CRM берёт данные из диспута, статистики курьера за текущий месяц, партии, города и настроек статуса.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <DetailItem label="Статус курьера" value={preview.stat?.statusName ?? "—"} hint={`${(preview.stat?.disputePercent ?? 0).toFixed(2)}% диспутов`} />
          <DetailItem label="Решение" value={preview.decision?.name ?? "—"} hint={getDisputeRuleSummary(preview.activeRule)} />
          <DetailItem label="Розница" value={formatMoney(issue.retailPrice)} hint={issue.marketplace || "МП не указан"} />
          <DetailItem label="Себестоимость клада" value={formatMoney(preview.stashCost)} hint={`${formatMoney(preview.baseCost)}${preview.fasCost ? ` + ФАС за адрес ${formatMoney(preview.fasCost)}` : ""}`} />
          <DetailItem label="Работа курьера" value={formatMoney(preview.courierWork)} hint="Розница: цена за вес + надбавка типа" />
          {preview.decisionKind === "COUPON" && <DetailItem label="Купон" value={`${Number(couponPercent || 0)}%`} hint="процент вводит админ" />}
          <DetailItem label="Ущерб" value={formatMoney(preview.damage)} hint={preview.decisionKind === "COUPON" ? "розница × процент купона" : "полный возврат клиенту"} />
          <DetailItem label="Предварительное списание" value={formatMoney(preview.writeOff)} hint={preview.manualMode ? "ручной режим: списание через кнопку Штраф" : "финально спишется при выплате банка"} />
          <DetailItem label="Источник логики" value={preview.statusRule?.name ?? "—"} hint="Настройки → Статусы курьера" />
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" className="rounded-xl" type="button">Отмена</Button></DialogClose>
        <Button className="rounded-xl" onClick={() => mutation.mutate()} disabled={mutation.isPending || (preview.decisionKind === "COUPON" && (Number(couponPercent) < 1 || Number(couponPercent) > 100))}>Закрыть</Button>
      </DialogFooter>
    </div>
  );
}

function BatchDetails({ state, batch }: { state: AppState; batch: AppState["batches"][number] }) {
  const metrics = getBatchMetrics(state, batch);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <DetailItem label="Курьер" value={getName(state.employees, batch.courierId)} hint="партия закреплена" />
        <DetailItem label="Сделано" value={`${metrics.addresses} адресов`} hint={`${formatNumber(metrics.grams)} г списано`} />
        <DetailItem label="Заработал" value={formatMoney(metrics.earnings)} hint="по вводам этой партии" />
        <DetailItem label="На руках" value={`${formatNumber(batch.remainingGram)} г`} hint={`из ${formatNumber(batch.weight)} г`} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <DetailItem label="Реальная себестоимость на руках" value={formatMoney(metrics.productCost)} hint={`${formatNumber(batch.remainingGram)} г × ${formatMoney(batch.costPerGram)} за 1 г`} />
        <DetailItem label="Состав себестоимости" value={formatMoney(getBatchRealTotalCost(batch))} hint={`товар ${formatMoney(getBatchTotalCost(batch))} + ФАС ${formatMoney(batch.fasEnabled ? batch.fasCost : 0)} + склад ${formatMoney(batch.warehouseWorkCost)}`} />
        <DetailItem label="Стоимость на руках" value={formatMoney(metrics.onHandValue)} hint="по реальной себестоимости 1 г" />
      </div>
      <Card className="rounded-[20px]"><CardHeader><CardTitle>Что сделал курьер по партии</CardTitle></CardHeader><CardContent className="overflow-hidden rounded-2xl border p-0"><Table><TableHeader><TableRow><TableHead>Режим</TableHead><TableHead>Вес</TableHead><TableHead>Тип</TableHead><TableHead>Адреса</TableHead><TableHead>Граммы</TableHead><TableHead>Заработок</TableHead></TableRow></TableHeader><TableBody>{metrics.lines.map((line) => <TableRow key={`${line.mode}-${line.weight}-${line.stashType}`}><TableCell>{modeLabels[line.mode as Mode] ?? line.mode}</TableCell><TableCell>{formatNumber(line.weight)} г</TableCell><TableCell>{line.stashType}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{formatNumber(line.grams)} г</TableCell><TableCell>{formatMoney(line.earnings)}</TableCell></TableRow>)}{metrics.lines.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">По партии ещё нет вводов данных</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    </div>
  );
}

function IssueDetails({ state, issue, showMarketplace }: { state: AppState; issue: Issue; showMarketplace: boolean }) {
  const decision = state.decisions.find((item) => item.id === issue.decisionId);
  const entry = state.dataEntries.find((item) => item.id === issue.dataEntryId);
  const batch = state.batches.find((item) => item.id === (issue.batchId ?? entry?.batchId));
  const finalWriteOff = getSettlementWriteOff(state, issue.id);
  const settlement = finalWriteOff ? state.monthlySettlements.find((item) => item.id === finalWriteOff.settlementId) : undefined;
  const calculation = safeJson<{
    source?: { courierStats?: { statusName?: string; disputePercent?: number }; settings?: { returnRules?: Partial<DisputeRuleDraft>; couponRules?: Partial<DisputeRuleDraft> } };
    decisionKind?: DecisionKind;
    configuredRules?: Partial<DisputeRuleDraft>;
    couponPercent?: number | null;
    stashCost?: number;
    courierWork?: number;
    damage?: number;
    manualMode?: boolean;
  }>(issue.calculationData ?? undefined, {});
  const logic = issue.status === "OPEN"
    ? "Запись открыта: списание ещё не применено. Диспут уже участвует в проценте диспутов курьера."
    : issue.kind === "TICKET"
      ? "Тикет закрыт без денежного списания."
      : finalWriteOff
        ? `Диспут рассчитан в выплате банка. Статус расчёта: ${finalWriteOff.statusRuleName}.`
        : `Диспут закрыт по решению ${decision?.name ?? "—"}. Финальное списание будет рассчитано при выплате банка после ввода количества продаж.`;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <DetailItem label="Номер заказа" value={getIssueLabel(issue)} hint={issue.orderNumber ? "имя записи" : "старый тикет/диспут без номера"} />
        <DetailItem label="Тип" value={issue.kind === "TICKET" ? "Тикет" : "Диспут"} hint={issue.status === "OPEN" ? "открыт" : finalWriteOff ? "рассчитан" : issue.kind === "DISPUTE" ? "ожидает финального расчёта" : "закрыт"} />
        <DetailItem label="Курьер" value={getName(state.employees, issue.courierId)} />
        <DetailItem label="Вес" value={`${formatNumber(issue.weight)} г`} hint={issue.stashType || "тип не указан"} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {showMarketplace && <DetailItem label="МП" value={issue.marketplace || "—"} />}
        <DetailItem label="Розница" value={formatMoney(issue.retailPrice)} hint="ручной ввод" />
        <DetailItem label="Проблемы" value={getProblemNames(state, issue)} />
        <DetailItem label="Финальное списание" value={formatMoney(finalWriteOff?.writeOffAmount ?? issue.writeOff)} hint={finalWriteOff ? `выплата ${finalWriteOff.settlementId.slice(0, 8)}` : issue.status === "OPEN" ? "ожидает решения" : "ожидает выплаты банка"} />
      </div>
      <div className="rounded-2xl border bg-muted/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Логика</p>
        <p className="mt-2 text-sm leading-6">{logic}</p>
        {calculation.configuredRules && <p className="mt-2 text-sm text-muted-foreground">Правило: {getDisputeRuleSummary(normalizeDisputeRule(calculation.configuredRules))}.</p>}
        {calculation.source?.courierStats && <p className="mt-1 text-sm text-muted-foreground">Статус при закрытии: {calculation.source.courierStats.statusName}; диспуты {Number(calculation.source.courierStats.disputePercent ?? 0).toFixed(2)}%.</p>}
        {typeof calculation.stashCost === "number" && <p className="mt-1 text-sm text-muted-foreground">Себестоимость клада: {formatMoney(calculation.stashCost)}; работа курьера: {formatMoney(calculation.courierWork ?? 0)}; ущерб: {formatMoney(calculation.damage ?? 0)}.</p>}
        {calculation.manualMode && <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Ручной режим: автоматическое списание не выполнено, итоговый штраф задаётся через Финансы → Штраф.</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <DetailItem label="Партия" value={batch?.name ?? "—"} hint={batch ? `${getName(state.products, batch.productId)} · остаток ${formatNumber(batch.remainingGram)} г` : undefined} />
        <DetailItem label="Ввод данных" value={entry ? `${entry.quantity} адресов · ${formatNumber(entry.grossWeight)} г` : "—"} hint={entry ? `заработок ${formatMoney(entry.earnings)}` : undefined} />
      </div>
      {settlement && <div className="rounded-2xl border bg-emerald-500/5 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Выплата банка</p><p className="mt-2 text-sm">Период: {formatDate(settlement.periodFrom)} — {formatDate(settlement.periodTo)}. Продано: {settlement.soldQuantity}; диспуты: {settlement.disputeCount}; статус: {settlement.courierStatusName}; итоговое списание по этому диспуту: {formatMoney(finalWriteOff?.writeOffAmount ?? 0)}.</p></div>}
      {issue.otherText && <div className="rounded-2xl border bg-muted/20 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Другое</p><p className="mt-2 text-sm leading-6">{issue.otherText}</p></div>}
    </div>
  );
}

function CourierDetails({ state, courier }: { state: AppState; courier: Employee }) {
  const entries = state.dataEntries.filter((entry) => entry.courierId === courier.id);
  const issues = state.issues.filter((issue) => issue.courierId === courier.id);
  const batches = state.batches.filter((batch) => batch.courierId === courier.id && batch.status === "ISSUED");
  const totals = sumEntries(entries);
  const stat = state.courierStats.find((item) => item.courierId === courier.id);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <DetailItem label="Статус курьера" value={stat?.statusName ?? "—"} hint={`${(stat?.disputePercent ?? 0).toFixed(2)}% диспутов`} />
        <DetailItem label="Адреса" value={totals.addresses} hint={`${formatNumber(totals.grams)} г за всё время`} />
        <DetailItem label="Заработок" value={formatMoney(totals.earnings)} hint="по всем вводам" />
        <DetailItem label="Диспуты / тикеты" value={`${issues.filter((i) => i.kind === "DISPUTE").length} / ${issues.filter((i) => i.kind === "TICKET").length}`} hint="за всё время" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <DetailItem label="На руки" value={formatMoney(courier.handBalance)} />
        <DetailItem label="Залог" value={formatMoney(courier.depositBalance)} />
        <DetailItem label="Банк" value={formatMoney(courier.bankBalance)} />
      </div>
      <Card className="rounded-[20px]"><CardHeader><CardTitle>Партии на руках</CardTitle></CardHeader><CardContent className="overflow-hidden rounded-2xl border p-0"><Table><TableHeader><TableRow><TableHead>Партия</TableHead><TableHead>Товар</TableHead><TableHead>Остаток</TableHead><TableHead>Сделано</TableHead><TableHead>Стоимость на руках</TableHead></TableRow></TableHeader><TableBody>{batches.map((batch) => { const metrics = getBatchMetrics(state, batch); return <TableRow key={batch.id}><TableCell>{batch.name}</TableCell><TableCell>{getName(state.products, batch.productId)}</TableCell><TableCell>{formatNumber(batch.remainingGram)} г</TableCell><TableCell>{metrics.addresses} адресов · {formatNumber(metrics.grams)} г</TableCell><TableCell>{formatMoney(metrics.onHandValue)}</TableCell></TableRow>; })}{batches.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Нет выданных партий на руках</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      <Card className="rounded-[20px]"><CardHeader><CardTitle>Диспуты и тикеты</CardTitle></CardHeader><CardContent className="overflow-hidden rounded-2xl border p-0"><Table><TableHeader><TableRow><TableHead>Номер заказа</TableHead><TableHead>Тип</TableHead><TableHead>Статус</TableHead><TableHead>Вес</TableHead><TableHead>Розница</TableHead><TableHead>Списано</TableHead><TableHead>Дата</TableHead></TableRow></TableHeader><TableBody>{issues.map((issue) => <TableRow key={issue.id}><TableCell className="font-medium">{getIssueLabel(issue)}</TableCell><TableCell>{issue.kind === "DISPUTE" ? "Диспут" : "Тикет"}</TableCell><TableCell><StatusBadge status={issue.status} /></TableCell><TableCell>{formatNumber(issue.weight)} г</TableCell><TableCell>{formatMoney(issue.retailPrice)}</TableCell><TableCell>{formatMoney(issue.writeOff)}</TableCell><TableCell>{formatDate(issue.createdAt)}</TableCell></TableRow>)}{issues.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Нет тикетов и диспутов</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    </div>
  );
}

function Statistics({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const canEdit = currentUser.role !== "COURIER";
  const initialRange = currentMonthRange();
  const [period, setPeriod] = useState(initialRange);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issueSearch, setIssueSearch] = useState("");
  const couriers = state.employees.filter((employee) => employee.role === "COURIER");
  const visibleCouriers = currentUser.role === "COURIER" ? couriers.filter((courier) => courier.id === currentUser.id) : couriers;
  const visibleEntries = state.dataEntries.filter((entry) => (currentUser.role === "COURIER" ? entry.courierId === currentUser.id : true) && inRange(entry.createdAt, period.from, period.to));
  const issueSearchQuery = issueSearch.trim().toLowerCase();
  const visibleIssues = state.issues.filter((issue) => {
    const inScope = (currentUser.role === "COURIER" ? issue.courierId === currentUser.id : true) && inRange(issue.createdAt, period.from, period.to);
    if (!inScope) return false;
    if (!issueSearchQuery) return true;
    return getIssueLabel(issue).toLowerCase().includes(issueSearchQuery) || issue.id.toLowerCase().includes(issueSearchQuery);
  });
  const rows = visibleCouriers.map((employee) => {
    const courierEntries = visibleEntries.filter((entry) => entry.courierId === employee.id);
    const courierIssues = visibleIssues.filter((issue) => issue.courierId === employee.id && issue.kind === "DISPUTE");
    const addresses = courierEntries.reduce((sum, entry) => sum + entry.quantity, 0);
    const disputePercent = addresses > 0 ? (courierIssues.length / addresses) * 100 : 0;
    const stat = state.courierStats.find((item) => item.courierId === employee.id);
    return {
      employee,
      addresses,
      disputes: courierIssues.length,
      disputePercent,
      statusName: stat?.statusName ?? "—",
    };
  });
  const closeTicket = useMutation({
    mutationFn: (issueId: string) => client.closeTicket({ actorLogin: currentUser.login, issueId }),
    onSuccess: () => {
      toast.success("Тикет закрыт");
      queryClient.invalidateQueries({ queryKey: ["appState"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-[20px]">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Дата от"><Input className="h-11 rounded-xl text-base" type="date" value={period.from} onChange={(event) => setPeriod((value) => ({ ...value, from: event.target.value }))} /></Field>
          <Field label="Дата до"><Input className="h-11 rounded-xl text-base" type="date" value={period.to} onChange={(event) => setPeriod((value) => ({ ...value, to: event.target.value }))} /></Field>
        </CardContent>
      </Card>
      <Card className="rounded-[20px]">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div><CardTitle>Таблица курьеров</CardTitle><p className="text-sm text-muted-foreground">Курьер видит только свои показатели и без МП.</p></div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <ActionDialog title="Ввод данных" description="Количество должно быть полностью распределено по МП." trigger={<Button className="rounded-xl">Ввод данных</Button>}>
                <DataEntryForm state={state} currentUser={currentUser} />
              </ActionDialog>
              <ActionDialog title="Открыть тикет / диспут" trigger={<Button variant="outline" className="rounded-xl">Тикет / диспут</Button>}>
                <IssueForm state={state} currentUser={currentUser} />
              </ActionDialog>
            </div>
          )}
        </CardHeader>
        <CardContent><CourierTable rows={rows} showMoney={currentUser.role !== "COURIER"} state={state} /></CardContent>
      </Card>
      <Card className="rounded-[20px]">
        <CardHeader><CardTitle>История вводов данных</CardTitle></CardHeader>
        <CardContent className="overflow-hidden rounded-2xl border p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Курьер</TableHead><TableHead>Город</TableHead><TableHead>Режим</TableHead><TableHead>Адреса</TableHead><TableHead>Граммы</TableHead>{currentUser.role !== "COURIER" && <TableHead>МП</TableHead>}<TableHead>Заработок</TableHead>{canEdit && <TableHead>Действие</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {visibleEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  <TableCell>{getName(state.employees, entry.courierId)}</TableCell>
                  <TableCell>{getName(state.cities, entry.cityId)}</TableCell>
                  <TableCell>{modeLabels[entry.mode as Mode] ?? entry.mode}</TableCell>
                  <TableCell>{entry.quantity}</TableCell>
                  <TableCell>{formatNumber(entry.grossWeight)} г</TableCell>
                  {currentUser.role !== "COURIER" && <TableCell className="max-w-[220px] truncate text-muted-foreground">{Object.entries(parseMpDistribution(entry.mpDistribution)).map(([mp, qty]) => `${mp}: ${qty}`).join(", ")}</TableCell>}
                  <TableCell>{formatMoney(entry.earnings)}</TableCell>
                  {canEdit && <TableCell><ActionDialog title="Редактирование ввода" trigger={<Button size="sm" variant="outline" className="rounded-xl">Редактировать</Button>}><DataEntryForm state={state} currentUser={currentUser} editing={entry} /></ActionDialog></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="rounded-[20px]">
        <CardHeader className="gap-4">
          <div><CardTitle>Тикеты и диспуты</CardTitle><p className="text-sm text-muted-foreground">Номер заказа используется как имя тикета/диспута и ищется здесь.</p></div>
          <Input className="h-11 rounded-xl text-base md:max-w-md" placeholder="Поиск по номеру заказа" value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} />
        </CardHeader>
        <CardContent className="overflow-hidden rounded-2xl border p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Номер заказа</TableHead><TableHead>Тип</TableHead><TableHead>Курьер</TableHead>{currentUser.role !== "COURIER" && <TableHead>МП</TableHead>}<TableHead>Розница</TableHead><TableHead>Статус</TableHead><TableHead>Дата</TableHead>{canEdit && <TableHead>Действие</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {visibleIssues.map((issue) => (
                <TableRow key={issue.id} className="cursor-pointer transition duration-200 hover:bg-muted/70" onClick={() => setSelectedIssue(issue)}>
                  <TableCell className="font-medium">{getIssueLabel(issue)}</TableCell>
                  <TableCell>{issue.kind === "TICKET" ? "Тикет" : "Диспут"}</TableCell>
                  <TableCell>{getName(state.employees, issue.courierId)}</TableCell>
                  {currentUser.role !== "COURIER" && <TableCell>{issue.marketplace}</TableCell>}
                  <TableCell>{formatMoney(issue.retailPrice)}</TableCell>
                  <TableCell><StatusBadge status={issue.status} /></TableCell>
                  <TableCell>{formatDate(issue.createdAt)}</TableCell>
                  {canEdit && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {issue.status === "OPEN" && issue.kind === "TICKET" && <Button size="sm" className="rounded-xl" onClick={() => closeTicket.mutate(issue.id)}>Закрыть</Button>}
                      {issue.status === "OPEN" && issue.kind === "DISPUTE" && <ActionDialog title="Закрыть диспут" trigger={<Button size="sm" className="rounded-xl">Закрыть</Button>}><CloseDisputeForm state={state} currentUser={currentUser} issue={issue} /></ActionDialog>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {visibleIssues.length === 0 && <EmptyRow colSpan={canEdit ? (currentUser.role !== "COURIER" ? 8 : 7) : (currentUser.role !== "COURIER" ? 7 : 6)} label={issueSearchQuery ? "По этому номеру заказа ничего не найдено" : "Нет тикетов и диспутов"} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={Boolean(selectedIssue)} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[20px] sm:max-w-5xl">
          <DialogHeader><DialogTitle>{selectedIssue?.kind === "TICKET" ? "Подробности тикета" : "Подробности диспута"}</DialogTitle><DialogDescription>Полная логика, суммы, списания и связанные данные.</DialogDescription></DialogHeader>
          {selectedIssue && <IssueDetails state={state} issue={selectedIssue} showMarketplace={currentUser.role !== "COURIER"} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Batches({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", cityId: state.cities[0]?.id ?? "", productId: state.products[0]?.id ?? "", weight: "500" });
  const [filters, setFilters] = useState({ status: "ALL", productId: "ALL", courierId: "ALL", cityId: "ALL", from: "", to: "" });
  const [selectedBatch, setSelectedBatch] = useState<AppState["batches"][number] | null>(null);
  const [issueForms, setIssueForms] = useState<Record<string, IssueBatchForm>>({});
  const [closeForms, setCloseForms] = useState<Record<string, { retailCloseSum: string; reason: string }>>({});
  const couriers = state.employees.filter((employee) => employee.role === "COURIER" && employee.status === "ACTIVE");
  const filteredBatches = state.batches.filter((batch) => {
    if (filters.status !== "ALL" && batch.status !== filters.status) return false;
    if (filters.productId !== "ALL" && batch.productId !== filters.productId) return false;
    if (filters.courierId !== "ALL" && batch.courierId !== filters.courierId) return false;
    if (filters.cityId !== "ALL" && batch.cityId !== filters.cityId) return false;
    if (filters.from && !inRange(batch.createdAt, filters.from, filters.to || filters.from)) return false;
    return true;
  });
  const getIssueValues = (batch: AppState["batches"][number]): IssueBatchForm => issueForms[batch.id] ?? {
    courierId: couriers[0]?.id ?? "",
    totalBatchCost: getBatchTotalCost(batch) > 0 ? String(getBatchTotalCost(batch)) : "",
    warehouseWorkCost: batch.warehouseWorkCost > 0 ? String(batch.warehouseWorkCost) : "",
    fasEnabled: batch.fasEnabled,
    fasCost: batch.fasCost > 0 ? String(batch.fasCost) : "0",
    fasPackages: batch.fasPackages > 0 ? String(batch.fasPackages) : "0",
  };
  const create = useMutation({
    mutationFn: () => client.createBatch({ actorLogin: currentUser.login, name: form.name, cityId: form.cityId, productId: form.productId, weight: Number(form.weight) }),
    onSuccess: () => { toast.success("Партия создана"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });
  const issue = useMutation({
    mutationFn: (batchId: string) => {
      const batch = state.batches.find((item) => item.id === batchId);
      if (!batch) throw new Error("Партия не найдена");
      const values = getIssueValues(batch);
      return client.issueBatch({ actorLogin: currentUser.login, batchId, courierId: values.courierId, totalBatchCost: Number(values.totalBatchCost), warehouseWorkCost: values.warehouseWorkCost === "" ? undefined : Number(values.warehouseWorkCost), fasEnabled: values.fasEnabled, fasCost: Number(values.fasCost), fasPackages: Number(values.fasPackages) });
    },
    onSuccess: () => { toast.success("Партия выдана"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });
  const close = useMutation({
    mutationFn: (batchId: string) => {
      const values = closeForms[batchId] ?? { retailCloseSum: "0", reason: "Закрытие партии" };
      return client.closeBatch({ actorLogin: currentUser.login, batchId, retailCloseSum: Number(values.retailCloseSum), reason: values.reason });
    },
    onSuccess: () => { toast.success("Партия закрыта"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-[20px]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Партии</CardTitle>
          <ActionDialog title="Создать партию" trigger={<Button className="rounded-xl">Создать партию</Button>}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Название"><Input className="h-11 rounded-xl text-base" value={form.name} onChange={(event) => setForm((item) => ({ ...item, name: event.target.value }))} /></Field>
              <Field label="Город"><Select value={form.cityId} onValueChange={(value) => setForm((item) => ({ ...item, cityId: value }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{state.cities.filter((city) => city.status === "ACTIVE").map((city) => <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Товар"><Select value={form.productId} onValueChange={(value) => setForm((item) => ({ ...item, productId: value }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{state.products.filter((product) => product.status === "ACTIVE").map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Вес, г"><Input className="h-11 rounded-xl text-base" inputMode="decimal" value={form.weight} onChange={(event) => setForm((item) => ({ ...item, weight: event.target.value }))} /></Field>
            </div>
            <DialogFooter><Button className="rounded-xl" onClick={() => create.mutate()} disabled={create.isPending}>Создать</Button></DialogFooter>
          </ActionDialog>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Статус"><Select value={filters.status} onValueChange={(value) => setFilters((item) => ({ ...item, status: value }))}><SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Все</SelectItem><SelectItem value="NEW">Новая</SelectItem><SelectItem value="ISSUED">Выдана</SelectItem><SelectItem value="CLOSED">Закрыта</SelectItem></SelectContent></Select></Field>
            <Field label="Товар"><Select value={filters.productId} onValueChange={(value) => setFilters((item) => ({ ...item, productId: value }))}><SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Все</SelectItem>{state.products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Курьер"><Select value={filters.courierId} onValueChange={(value) => setFilters((item) => ({ ...item, courierId: value }))}><SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Все</SelectItem>{couriers.map((courier) => <SelectItem key={courier.id} value={courier.id}>{courier.login}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Город"><Select value={filters.cityId} onValueChange={(value) => setFilters((item) => ({ ...item, cityId: value }))}><SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Все</SelectItem>{state.cities.map((city) => <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Дата от"><Input className="h-10 rounded-xl" type="date" value={filters.from} onChange={(event) => setFilters((item) => ({ ...item, from: event.target.value }))} /></Field>
            <Field label="Дата до"><Input className="h-10 rounded-xl" type="date" value={filters.to} onChange={(event) => setFilters((item) => ({ ...item, to: event.target.value }))} /></Field>
          </div>
          <div className="overflow-hidden rounded-2xl border p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Название</TableHead><TableHead>Город</TableHead><TableHead>Товар</TableHead><TableHead>Вес</TableHead><TableHead>Остаток</TableHead><TableHead>Курьер</TableHead><TableHead>Статус</TableHead><TableHead>Действия</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredBatches.map((batch) => {
                const issueValues = getIssueValues(batch);
                const totalBatchCost = Number(issueValues.totalBatchCost || 0);
                const warehouseWorkCost = Number(issueValues.warehouseWorkCost || 0);
                const fasCostForReal = issueValues.fasEnabled ? Number(issueValues.fasCost || 0) : 0;
                const realTotalCost = totalBatchCost + fasCostForReal + warehouseWorkCost;
                const derivedCostPerGram = batch.weight > 0 ? realTotalCost / batch.weight : 0;
                const closeValues = closeForms[batch.id] ?? { retailCloseSum: "0", reason: "Закрытие партии" };
                return (
                  <TableRow key={batch.id} className={batch.status === "ISSUED" ? "cursor-pointer transition duration-200 hover:bg-muted/70" : undefined} onClick={() => batch.status === "ISSUED" && setSelectedBatch(batch)}>
                    <TableCell className="font-medium">{batch.name}</TableCell>
                    <TableCell>{getName(state.cities, batch.cityId)}</TableCell>
                    <TableCell>{getName(state.products, batch.productId)}</TableCell>
                    <TableCell>{formatNumber(batch.weight)} г</TableCell>
                    <TableCell>{formatNumber(batch.remainingGram)} г</TableCell>
                    <TableCell>{getName(state.employees, batch.courierId)}</TableCell>
                    <TableCell><StatusBadge status={batch.status} /></TableCell>
                    <TableCell className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      {batch.status === "NEW" && (
                        <ActionDialog title="Выдать партию" description="Партия выдаётся полностью и только одному курьеру." trigger={<Button size="sm" className="rounded-xl">Выдать</Button>}>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Курьер"><Select value={issueValues.courierId} onValueChange={(value) => setIssueForms((all) => ({ ...all, [batch.id]: { ...issueValues, courierId: value } }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{couriers.map((courier) => <SelectItem key={courier.id} value={courier.id}>{courier.login}</SelectItem>)}</SelectContent></Select></Field>
                            <Field label="Цена товара" hint="Стоимость самой партии/МК без ФАС и работы склада."><Input className="h-11 rounded-xl text-base" inputMode="decimal" value={issueValues.totalBatchCost} onChange={(event) => setIssueForms((all) => ({ ...all, [batch.id]: { ...issueValues, totalBatchCost: event.target.value } }))} /></Field>
                            <Field label="Стоимость ФАС" hint="Отдельно от себестоимости товара и зарплаты."><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={issueValues.fasCost} onChange={(event) => setIssueForms((all) => ({ ...all, [batch.id]: { ...issueValues, fasCost: event.target.value } }))} /></Field>
                            <Field label="Оплата работы склада" hint="Необязательно: если пусто, CRM считает 0."><Input className="h-11 rounded-xl text-base" inputMode="decimal" placeholder="0" value={issueValues.warehouseWorkCost} onChange={(event) => setIssueForms((all) => ({ ...all, [batch.id]: { ...issueValues, warehouseWorkCost: event.target.value } }))} /></Field>
                            <Field label="Количество ФАС"><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={issueValues.fasPackages} onChange={(event) => setIssueForms((all) => ({ ...all, [batch.id]: { ...issueValues, fasPackages: event.target.value } }))} /></Field>
                            <div className="flex items-center gap-2 rounded-2xl border p-3"><Checkbox checked={issueValues.fasEnabled} onCheckedChange={(checked) => setIssueForms((all) => ({ ...all, [batch.id]: { ...issueValues, fasEnabled: checked === true } }))} /><span className="text-sm">ФАС учитывать в реальной себестоимости</span></div>
                            <DetailItem label="Реальная себестоимость 1 г" value={`${formatMoney(Number.isFinite(derivedCostPerGram) ? derivedCostPerGram : 0)} / г`} hint={`(${formatMoney(totalBatchCost)} + ${formatMoney(fasCostForReal)} + ${formatMoney(warehouseWorkCost)}) / ${formatNumber(batch.weight)} г`} />
                          </div>
                          <DialogFooter><Button className="rounded-xl" onClick={() => issue.mutate(batch.id)} disabled={issue.isPending}>Выдать</Button></DialogFooter>
                        </ActionDialog>
                      )}
                      {batch.status !== "CLOSED" && (
                        <ActionDialog title="Закрыть партию" description="Если потеря больше 10%, укажите розничную стоимость остатка." trigger={<Button size="sm" variant="destructive" className="rounded-xl">Закрыть</Button>}>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Розничная стоимость"><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={closeValues.retailCloseSum} onChange={(event) => setCloseForms((all) => ({ ...all, [batch.id]: { ...closeValues, retailCloseSum: event.target.value } }))} /></Field>
                            <Field label="Причина"><Input className="h-11 rounded-xl text-base" value={closeValues.reason} onChange={(event) => setCloseForms((all) => ({ ...all, [batch.id]: { ...closeValues, reason: event.target.value } }))} /></Field>
                          </div>
                          <DialogFooter><Button variant="destructive" className="rounded-xl" onClick={() => close.mutate(batch.id)} disabled={close.isPending}>Закрыть</Button></DialogFooter>
                        </ActionDialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={Boolean(selectedBatch)} onOpenChange={(open) => !open && setSelectedBatch(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[20px] sm:max-w-5xl">
          <DialogHeader><DialogTitle>Детали партии: {selectedBatch?.name}</DialogTitle><DialogDescription>Расход, заработок, остаток на руках и стоимость товара с ФАС.</DialogDescription></DialogHeader>
          {selectedBatch && <BatchDetails state={state} batch={selectedBatch} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PenaltyForm({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const couriers = state.employees.filter((employee) => employee.role === "COURIER");
  const [form, setForm] = useState({ courierId: couriers[0]?.id ?? "", issueId: "", amount: "0", applyCourierStatus: false, stashDeduction: false, reason: "" });
  const mutation = useMutation({
    mutationFn: () => client.applyPenalty({ actorLogin: currentUser.login, courierId: form.courierId, issueId: form.issueId || undefined, amount: Number(form.amount), applyCourierStatus: form.applyCourierStatus, stashDeduction: form.stashDeduction, reason: form.reason }),
    onSuccess: () => { toast.success("Штраф применён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Курьер"><Select value={form.courierId} onValueChange={(value) => setForm((item) => ({ ...item, courierId: value }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{couriers.map((courier) => <SelectItem key={courier.id} value={courier.id}>{courier.login}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Связанный диспут/тикет"><Select value={form.issueId} onValueChange={(value) => setForm((item) => ({ ...item, issueId: value }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue placeholder="Не выбран" /></SelectTrigger><SelectContent>{state.issues.filter((issue) => issue.courierId === form.courierId).map((issue) => <SelectItem key={issue.id} value={issue.id}>{getIssueLabel(issue)} · {issue.kind} · {formatDate(issue.createdAt)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Сумма штрафа"><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={form.amount} onChange={(event) => setForm((item) => ({ ...item, amount: event.target.value }))} /></Field>
      </div>
      <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.applyCourierStatus} onCheckedChange={(checked) => setForm((item) => ({ ...item, applyCourierStatus: checked === true }))} />Применить статус курьера</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.stashDeduction} onCheckedChange={(checked) => setForm((item) => ({ ...item, stashDeduction: checked === true }))} />Вычет за клад</label>
      </div>
      <Field label="Причина штрафа"><Textarea className="rounded-xl text-base" value={form.reason} onChange={(event) => setForm((item) => ({ ...item, reason: event.target.value }))} /></Field>
      <DialogFooter><Button variant="destructive" className="rounded-xl" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Применить штраф</Button></DialogFooter>
    </div>
  );
}

function Finance({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<Record<string, { hand: string; deposit: string; bank: string; disable: boolean }>>({});
  const month = currentMonthRange();
  const [payout, setPayout] = useState({ employeeId: state.employees.find((employee) => employee.role === "COURIER")?.id ?? "", amount: "0", applyBonus: false, periodFrom: month.from, periodTo: month.to, soldQuantity: "0" });
  const payoutEmployee = state.employees.find((employee) => employee.id === payout.employeeId);
  const payoutEntries = state.dataEntries.filter((entry) => entry.courierId === payout.employeeId && inRange(entry.createdAt, payout.periodFrom, payout.periodTo));
  const payoutIssues = state.issues.filter((issue) => issue.courierId === payout.employeeId && inRange(issue.createdAt, payout.periodFrom, payout.periodTo));
  const soldQuantity = Number(payout.soldQuantity || 0);
  const payoutDisputes = payoutIssues.filter((issue) => issue.kind === "DISPUTE");
  const openDisputes = payoutDisputes.filter((issue) => issue.status === "OPEN");
  const disputePercent = soldQuantity > 0 ? (payoutDisputes.length / soldQuantity) * 100 : 0;
  const openDisputePercent = soldQuantity > 0 ? (openDisputes.length / soldQuantity) * 100 : 0;
  const payoutStatusRule = state.statusRules.find((rule) => disputePercent >= rule.minPercent && (rule.maxPercent === null || disputePercent <= rule.maxPercent));
  const closedForSettlement = state.issues.filter((issue) => issue.courierId === payout.employeeId && issue.kind === "DISPUTE" && issue.status === "CLOSED" && issue.closedAt && inRange(issue.closedAt, payout.periodFrom, payout.periodTo) && !getSettlementWriteOff(state, issue.id));
  const disputeWriteOffPreview = closedForSettlement.map((issue) => ({ issue, ...getIssueWriteOffWithStatus(state, issue, payoutStatusRule) }));
  const totalDisputeWriteOff = disputeWriteOffPreview.reduce((sum, item) => sum + item.writeOff, 0);
  const bankWrittenOff = Math.min(payoutEmployee?.bankBalance ?? 0, totalDisputeWriteOff);
  const depositWrittenOff = Math.max(0, totalDisputeWriteOff - bankWrittenOff);
  const bankAfterWriteOff = (payoutEmployee?.bankBalance ?? 0) - bankWrittenOff;
  const depositAfterWriteOff = (payoutEmployee?.depositBalance ?? 0) - depositWrittenOff;
  const bonusSetting = safeJson<{ maxPercent?: number; depositMskSpb?: number; depositRegions?: number; addressThreshold?: number; rules?: Array<{ name?: string; enabled?: boolean; bonusPercent?: number; minAddresses?: number; maxDisputePercent?: number; depositRequired?: number; logic?: string }> }>(state.settings.find((item) => item.key === "bonusRules")?.value, {});
  const defaultDepositRequired = bonusSetting.depositMskSpb ?? 250000;
  const bonusRules = bonusSetting.rules?.length ? bonusSetting.rules : [{ name: "+10% за продажи", bonusPercent: 10, minAddresses: bonusSetting.addressThreshold ?? 600, maxDisputePercent: 999, depositRequired: defaultDepositRequired, logic: "Порог продаж за период" }, { name: "+5% за диспуты", bonusPercent: 5, minAddresses: 0, maxDisputePercent: 10, depositRequired: defaultDepositRequired, logic: "Диспуты не выше 10%" }];
  let bonusPercent = 0;
  const bonusRuleResults = bonusRules.map((rule) => { const applied = payout.applyBonus && rule.enabled !== false && soldQuantity >= (rule.minAddresses ?? 0) && disputePercent <= (rule.maxDisputePercent ?? 999) && depositAfterWriteOff >= (rule.depositRequired ?? defaultDepositRequired); if (applied) bonusPercent += rule.bonusPercent ?? 0; return { rule, applied, requiredDeposit: rule.depositRequired ?? defaultDepositRequired }; });
  bonusPercent = Math.min(bonusPercent, bonusSetting.maxPercent ?? 15);
  const periodEarnings = payoutEntries.reduce((sum, entry) => sum + entry.earnings, 0);
  const bonusAmount = payout.applyBonus ? (periodEarnings * bonusPercent) / 100 : 0;
  const finalBankAfterPayout = bankAfterWriteOff + bonusAmount - Number(payout.amount || 0);
  const calc = useMutation({
    mutationFn: (id: string) => {
      const item = forms[id] ?? { hand: "0", deposit: "0", bank: "0", disable: false };
      return client.calculateFinance({ actorLogin: currentUser.login, processingId: id, handAmount: Number(item.hand), depositAmount: Number(item.deposit), bankAmount: Number(item.bank), disableLimit: item.disable });
    },
    onSuccess: () => { toast.success("Расчёт применён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });
  const payoutMutation = useMutation({
    mutationFn: () => client.payoutBank({ actorLogin: currentUser.login, employeeId: payout.employeeId, amount: Number(payout.amount), applyBonus: payout.applyBonus, soldQuantity: Number(payout.soldQuantity), periodFrom: payout.periodFrom, periodTo: payout.periodTo }),
    onSuccess: () => { toast.success("Банк выплачен"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-[20px]">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div><CardTitle>В обработке</CardTitle><p className="text-sm text-muted-foreground">Каждый ввод данных — отдельная строка расчёта.</p></div>
          <div className="flex flex-wrap gap-2">
            <ActionDialog title="Выплатить банк" description="Финальный расчёт: продажи → % диспутов → статус → списания → бонус → выплата." trigger={<Button className="rounded-xl">Выплатить банк</Button>}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Курьер"><Select value={payout.employeeId} onValueChange={(value) => setPayout((item) => ({ ...item, employeeId: value }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{state.employees.filter((employee) => employee.role === "COURIER").map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.login} · банк {formatMoney(employee.bankBalance)}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Период от"><Input className="h-11 rounded-xl text-base" type="date" value={payout.periodFrom} onChange={(event) => setPayout((item) => ({ ...item, periodFrom: event.target.value }))} /></Field>
                <Field label="Период до"><Input className="h-11 rounded-xl text-base" type="date" value={payout.periodTo} onChange={(event) => setPayout((item) => ({ ...item, periodTo: event.target.value }))} /></Field>
                <Field label="Количество продаж"><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={payout.soldQuantity} onChange={(event) => setPayout((item) => ({ ...item, soldQuantity: event.target.value }))} /></Field>
                <Field label="Сумма выплаты"><Input className="h-11 rounded-xl text-base" inputMode="numeric" value={payout.amount} onChange={(event) => setPayout((item) => ({ ...item, amount: event.target.value }))} /></Field>
              </div>
              <label className="flex items-center gap-2 rounded-2xl border p-3 text-sm"><Checkbox checked={payout.applyBonus} onCheckedChange={(checked) => setPayout((item) => ({ ...item, applyBonus: checked === true }))} />Применить бонус</label>
              <div className="space-y-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="font-semibold">Предпросмотр расчёта</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailItem label="Загружено" value={payoutEntries.reduce((sum, entry) => sum + entry.quantity, 0)} hint="адресов за период" />
                  <DetailItem label="Продано" value={soldQuantity || "—"} hint="вводит админ" />
                  <DetailItem label="Тикеты" value={payoutIssues.filter((issue) => issue.kind === "TICKET").length} hint="за период" />
                  <DetailItem label="Диспуты" value={`${payoutDisputes.length} / ${openDisputes.length}`} hint="все / открытые" />
                  <DetailItem label="% диспутов" value={soldQuantity > 0 ? `${disputePercent.toFixed(2)}%` : "—"} hint="все диспуты / продажи" />
                  <DetailItem label="Статус" value={payoutStatusRule?.name ?? "—"} hint="по продажам" />
                  <DetailItem label="Открытые %" value={soldQuantity > 0 ? `${openDisputePercent.toFixed(2)}%` : "—"} hint={openDisputePercent > 10 ? "выплата будет заблокирована" : "лимит ≤ 10%"} />
                  <DetailItem label="Списания" value={formatMoney(totalDisputeWriteOff)} hint={`${closedForSettlement.length} закрытых диспутов`} />
                  <DetailItem label="Бонус" value={formatMoney(bonusAmount)} hint={payout.applyBonus ? `${bonusPercent}%` : "выключен"} />
                  <DetailItem label="Банк после списаний" value={formatMoney(bankAfterWriteOff)} hint={`из банка ${formatMoney(bankWrittenOff)}, из залога ${formatMoney(depositWrittenOff)}`} />
                  <DetailItem label="Сумма выплаты" value={formatMoney(Number(payout.amount || 0))} />
                  <DetailItem label="Банк после выплаты" value={formatMoney(finalBankAfterPayout)} hint={finalBankAfterPayout < -0.01 ? "сумма больше доступной" : "предварительно"} />
                </div>
                {payout.applyBonus && <div className="grid gap-2">{bonusRuleResults.map((item, index) => <div key={index} className="rounded-xl border bg-background/70 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{item.rule.name ?? `Бонус ${index + 1}`} · +{item.rule.bonusPercent ?? 0}%</span><StatusBadge status={item.applied ? "ACTIVE" : "INACTIVE"} /></div><p className="mt-1 text-muted-foreground">Продажи: {soldQuantity}/{item.rule.minAddresses ?? 0}; диспуты: {disputePercent.toFixed(2)}% ≤ {item.rule.maxDisputePercent ?? 999}%; залог: {formatMoney(depositAfterWriteOff)} / {formatMoney(item.requiredDeposit)}. {item.rule.logic}</p></div>)}</div>}
              </div>
              <DialogFooter><Button className="rounded-xl" onClick={() => payoutMutation.mutate()} disabled={payoutMutation.isPending}>Выплатить</Button></DialogFooter>
            </ActionDialog>
            <ActionDialog title="Штраф" description="Списывается из банка, затем из залога. Причина обязательна." trigger={<Button variant="destructive" className="rounded-xl">Штраф</Button>}>
              <PenaltyForm state={state} currentUser={currentUser} />
            </ActionDialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.financeProcessing.filter((item) => item.status === "PENDING").map((item) => {
            const values = forms[item.id] ?? { hand: "0", deposit: "0", bank: "0", disable: false };
            const distributed = Number(values.hand || 0) + Number(values.deposit || 0) + Number(values.bank || 0);
            const diff = item.earnings - distributed;
            const exact = Math.abs(diff) <= 0.01;
            const overLimit = !values.disable && Number(values.hand || 0) > item.maxHand + 0.01;
            return (
              <div key={item.id} className="grid gap-3 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-[1fr_150px_150px_150px_190px]">
                <div>
                  <p className="font-medium">{getName(state.employees, item.courierId)} · {getName(state.batches, item.batchId)}</p>
                  <p className="text-sm text-muted-foreground">Остаток {formatNumber(item.remainingGram)} г · заработок {formatMoney(item.earnings)} · максимум на руки {formatMoney(item.maxHand)}</p>
                  <p className={`mt-1 text-sm ${exact && !overLimit ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>Распределено {formatMoney(distributed)} из {formatMoney(item.earnings)}{!exact ? ` · осталось распределить ${formatMoney(diff)}` : " · сумма сходится"}{overLimit ? " · превышен лимит на руки" : ""}</p>
                </div>
                <Field label="На руки"><Input className="h-11 rounded-xl text-base" inputMode="numeric" placeholder="0" value={values.hand} onChange={(event) => setForms((all) => ({ ...all, [item.id]: { ...values, hand: event.target.value } }))} /></Field>
                <Field label="Залог"><Input className="h-11 rounded-xl text-base" inputMode="numeric" placeholder="0" value={values.deposit} onChange={(event) => setForms((all) => ({ ...all, [item.id]: { ...values, deposit: event.target.value } }))} /></Field>
                <Field label="Банк"><Input className="h-11 rounded-xl text-base" inputMode="numeric" placeholder="0" value={values.bank} onChange={(event) => setForms((all) => ({ ...all, [item.id]: { ...values, bank: event.target.value } }))} /></Field>
                <div className="flex flex-wrap items-center gap-2"><Checkbox checked={values.disable} onCheckedChange={(checked) => setForms((all) => ({ ...all, [item.id]: { ...values, disable: checked === true } }))} /><span className="text-xs text-muted-foreground">Откл. лимит</span><Button className="rounded-xl" disabled={!exact || overLimit || calc.isPending} onClick={() => calc.mutate(item.id)}>Применить</Button></div>
              </div>
            );
          })}
          {state.financeProcessing.filter((item) => item.status === "PENDING").length === 0 && <div className="rounded-2xl border p-8 text-center text-muted-foreground">Нет строк в обработке</div>}
        </CardContent>
      </Card>
      <Card className="rounded-[20px]">
        <CardHeader><CardTitle>Общий доход</CardTitle></CardHeader>
        <CardContent className="overflow-hidden rounded-2xl border p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Сотрудник</TableHead><TableHead>На руки</TableHead><TableHead>Залог</TableHead><TableHead>Банк</TableHead></TableRow></TableHeader>
            <TableBody>{state.employees.map((employee) => <TableRow key={employee.id}><TableCell>{employee.login}</TableCell><TableCell>{formatMoney(employee.handBalance)}</TableCell><TableCell>{formatMoney(employee.depositBalance)}</TableCell><TableCell>{formatMoney(employee.bankBalance)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="rounded-[20px]">
        <CardHeader><CardTitle>Денежная история</CardTitle></CardHeader>
        <CardContent className="overflow-hidden rounded-2xl border p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Сотрудник</TableHead><TableHead>Тип</TableHead><TableHead>Сумма</TableHead><TableHead>Комментарий</TableHead></TableRow></TableHeader>
            <TableBody>{state.financeLedger.map((item) => <TableRow key={item.id}><TableCell>{formatDate(item.createdAt)}</TableCell><TableCell>{getName(state.employees, item.employeeId)}</TableCell><TableCell>{item.type}</TableCell><TableCell>{formatMoney(item.amount)}</TableCell><TableCell className="text-muted-foreground">{item.note}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Employees({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ login: "", password: "", role: "COURIER" as Role });
  const create = useMutation({ mutationFn: () => client.createEmployee({ actorLogin: currentUser.login, ...form }), onSuccess: () => { toast.success("Сотрудник добавлен"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: (payload: { id: string; role?: Role; status?: string }) => client.updateEmployee({ actorLogin: currentUser.login, ...payload }), onSuccess: () => { toast.success("Сотрудник обновлён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  return (
    <div className="space-y-6">
      <Card className="rounded-[20px]">
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Сотрудники</CardTitle><ActionDialog title="Добавить сотрудника" trigger={<Button className="rounded-xl">Добавить</Button>}><div className="grid gap-4 md:grid-cols-3"><Field label="Логин"><Input className="h-11 rounded-xl text-base" value={form.login} onChange={(event) => setForm((item) => ({ ...item, login: event.target.value }))} /></Field><Field label="Пароль"><Input className="h-11 rounded-xl text-base" value={form.password} onChange={(event) => setForm((item) => ({ ...item, password: event.target.value }))} /></Field><Field label="Роль"><Select value={form.role} onValueChange={(value) => setForm((item) => ({ ...item, role: value as Role }))}><SelectTrigger className="h-11 w-full rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field></div><DialogFooter><Button className="rounded-xl" onClick={() => create.mutate()} disabled={create.isPending}>Добавить</Button></DialogFooter></ActionDialog></CardHeader>
        <CardContent className="overflow-hidden rounded-2xl border p-0">
          <Table><TableHeader><TableRow><TableHead>Логин</TableHead><TableHead>Роль</TableHead><TableHead>Статус</TableHead><TableHead>Залог</TableHead><TableHead>Банк</TableHead><TableHead>Права</TableHead></TableRow></TableHeader><TableBody>{state.employees.map((employee) => <TableRow key={employee.id}><TableCell>{employee.login}</TableCell><TableCell>{roleLabels[employee.role] ?? employee.role}</TableCell><TableCell><StatusBadge status={employee.status} /></TableCell><TableCell>{formatMoney(employee.depositBalance)}</TableCell><TableCell>{formatMoney(employee.bankBalance)}</TableCell><TableCell className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="rounded-xl" onClick={() => update.mutate({ id: employee.id, status: employee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>{employee.status === "ACTIVE" ? "Отключить" : "Включить"}</Button>{Object.entries(roleLabels).map(([role, label]) => <Button key={role} size="sm" variant={employee.role === role ? "default" : "outline"} className="rounded-xl" onClick={() => update.mutate({ id: employee.id, role: role as Role })}>{label}</Button>)}</TableCell></TableRow>)}</TableBody></Table>
        </CardContent>
      </Card>
    </div>
  );
}

type HandLimitDraft = { minDisputePercent: string; maxDisputePercent: string; maxHandPercent: string; payoutLimit: string; blockPayouts: boolean };
type BonusRuleDraft = { name: string; enabled: boolean; bonusPercent: string; minAddresses: string; maxDisputePercent: string; depositRequired: string; logic: string };
type BonusDraft = { period: string; maxPercent: string; depositMskSpb: string; depositRegions: string; rules: BonusRuleDraft[] };

function safeJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function confirmDelete(label: string) {
  return window.confirm(`Удалить «${label}»? Действие будет записано в логи. Если запись уже используется в истории CRM, система либо архивирует её, либо запретит удаление.`);
}

function deleteResultMessage(result: { mode?: string }, deletedText: string, archivedText?: string) {
  return result.mode === "ARCHIVED" ? (archivedText ?? "Запись используется в истории — она отключена вместо удаления") : deletedText;
}

function CitySettingsDialog({ state, currentUser, city }: { state: AppState; currentUser: Employee; city: AppState["cities"][number] }) {
  const queryClient = useQueryClient();
  const products = state.products;
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("RETAIL");
  const [cityDraft, setCityDraft] = useState({ name: city.name, status: city.status });
  const [productDrafts, setProductDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [stashDrafts, setStashDrafts] = useState<Record<string, { name: string; surcharge: string }>>({});
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0];
  const productSetting = state.citySettings.find((item) => item.cityId === city.id && item.productId === selectedProduct?.id && item.mode === mode);
  const prices = state.priceRates
    .filter((item) => item.cityId === city.id && item.productId === selectedProduct?.id && item.mode === mode)
    .sort((a, b) => a.weight - b.weight);
  const stashTypes = state.stashTypes.filter((item) => item.cityId === city.id && item.productId === selectedProduct?.id && item.mode === mode);
  const updateCity = useMutation({ mutationFn: () => client.updateCity({ actorLogin: currentUser.login, id: city.id, ...cityDraft }), onSuccess: () => { toast.success("Город сохранён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const updateProduct = useMutation({ mutationFn: () => client.updateProduct({ actorLogin: currentUser.login, id: selectedProduct?.id ?? "", name: productDrafts[selectedProduct?.id ?? ""] ?? selectedProduct?.name ?? "" }), onSuccess: () => { toast.success("Товар переименован"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const updateSetting = useMutation({ mutationFn: (status: string) => client.updateCityProductSetting({ actorLogin: currentUser.login, cityId: city.id, productId: selectedProduct?.id ?? "", mode, status }), onSuccess: () => { toast.success("Статус товара сохранён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const updatePrice = useMutation({ mutationFn: (rate: AppState["priceRates"][number]) => client.updatePriceRate({ actorLogin: currentUser.login, cityId: city.id, productId: rate.productId, mode: rate.mode as Mode, weight: rate.weight, price: Number(priceDrafts[rate.id] ?? rate.price) }), onSuccess: () => { toast.success("Цена сохранена"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const updateStash = useMutation({ mutationFn: (id: string) => { const current = state.stashTypes.find((item) => item.id === id); const draft = stashDrafts[id] ?? { name: current?.name ?? "", surcharge: String(current?.surcharge ?? 0) }; return client.updateStashType({ actorLogin: currentUser.login, id, name: draft.name, surcharge: Number(draft.surcharge) }); }, onSuccess: () => { toast.success("Надбавка сохранена"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteProduct = useMutation({ mutationFn: () => client.deleteProduct({ actorLogin: currentUser.login, id: selectedProduct?.id ?? "" }), onSuccess: (result) => { toast.success(deleteResultMessage(result, "Товар удалён", "Товар используется в истории — он отключён")); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deletePrice = useMutation({ mutationFn: (id: string) => client.deletePriceRate({ actorLogin: currentUser.login, id }), onSuccess: () => { toast.success("Строка цены удалена"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteStash = useMutation({ mutationFn: (id: string) => client.deleteStashType({ actorLogin: currentUser.login, id }), onSuccess: () => { toast.success("Надбавка удалена"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
        <Field label="Название города"><Input className="h-11 rounded-xl text-base" value={cityDraft.name} onChange={(event) => setCityDraft((item) => ({ ...item, name: event.target.value }))} /></Field>
        <Field label="Статус"><Select value={cityDraft.status} onValueChange={(value) => setCityDraft((item) => ({ ...item, status: value }))}><SelectTrigger className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Активен</SelectItem><SelectItem value="INACTIVE">Отключён</SelectItem></SelectContent></Select></Field>
        <div className="flex items-end"><Button className="h-11 rounded-xl" onClick={() => updateCity.mutate()} disabled={updateCity.isPending}>Сохранить город</Button></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Товар"><Select value={selectedProduct?.id ?? ""} onValueChange={setSelectedProductId}><SelectTrigger className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Режим"><Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}><TabsList className="h-11 rounded-xl"><TabsTrigger value="RETAIL">Розница</TabsTrigger><TabsTrigger value="BATCH">Партии</TabsTrigger></TabsList></Tabs></Field>
      </div>
      {selectedProduct && (
        <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-[1fr_auto_auto]">
          <Field label="Наименование товара">
            <Input className="h-11 rounded-xl text-base" value={productDrafts[selectedProduct.id] ?? selectedProduct.name} onChange={(event) => setProductDrafts((all) => ({ ...all, [selectedProduct.id]: event.target.value }))} />
          </Field>
          <div className="flex items-end"><Button variant="outline" className="h-11 rounded-xl" onClick={() => updateProduct.mutate()} disabled={updateProduct.isPending}>Переименовать товар</Button></div>
          <div className="flex items-end"><Button variant="destructive" className="h-11 rounded-xl" onClick={() => selectedProduct && confirmDelete(selectedProduct.name) && deleteProduct.mutate()} disabled={deleteProduct.isPending}>Удалить товар</Button></div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-4">
        <div><p className="font-medium">{selectedProduct?.name} · {modeLabels[mode]}</p><p className="text-sm text-muted-foreground">Типы, надбавки и цены раздельны для розницы и партий.</p></div>
        <Button variant={productSetting?.status === "ACTIVE" ? "default" : "outline"} className="rounded-xl" onClick={() => updateSetting.mutate(productSetting?.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{productSetting?.status === "ACTIVE" ? "Вкл" : "Выкл"}</Button>
      </div>
      <Card className="rounded-[20px]"><CardHeader><CardTitle>Вес → Цена за работу</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{prices.map((rate) => <div key={rate.id} className="grid grid-cols-[100px_minmax(180px,1fr)_auto_auto] items-center gap-3 rounded-2xl border p-4"><span className="text-sm font-medium">{formatNumber(rate.weight)} г</span><Input className="h-12 rounded-xl px-4 text-base" inputMode="numeric" value={priceDrafts[rate.id] ?? String(rate.price)} onChange={(event) => setPriceDrafts((all) => ({ ...all, [rate.id]: event.target.value }))} /><Button size="sm" variant="outline" className="h-10 rounded-xl" onClick={() => updatePrice.mutate(rate)}>Сохранить</Button><Button size="sm" variant="destructive" className="h-10 rounded-xl" onClick={() => confirmDelete(`${formatNumber(rate.weight)} г`) && deletePrice.mutate(rate.id)}>Удалить</Button></div>)}</CardContent></Card>
      <Card className="rounded-[20px]"><CardHeader><CardTitle>Надбавки Тип-1 / Тип-2 / Тип-3</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{stashTypes.map((type) => { const draft = stashDrafts[type.id] ?? { name: type.name, surcharge: String(type.surcharge) }; return <div key={type.id} className="space-y-3 rounded-2xl border p-3"><Field label="Название"><Input className="h-10 rounded-xl" value={draft.name} onChange={(event) => setStashDrafts((all) => ({ ...all, [type.id]: { ...draft, name: event.target.value } }))} /></Field><Field label="Надбавка"><Input className="h-10 rounded-xl" inputMode="numeric" value={draft.surcharge} onChange={(event) => setStashDrafts((all) => ({ ...all, [type.id]: { ...draft, surcharge: event.target.value } }))} /></Field><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" className="rounded-xl" onClick={() => updateStash.mutate(type.id)}>Сохранить</Button><Button variant="destructive" className="rounded-xl" onClick={() => confirmDelete(type.name) && deleteStash.mutate(type.id)}>Удалить</Button></div></div>; })}</CardContent></Card>
    </div>
  );
}

function SimpleNameForm({ label, initialName, onSave }: { label: string; initialName: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return <div className="grid gap-4"><Field label={label}><Input className="h-11 rounded-xl text-base" value={name} onChange={(event) => setName(event.target.value)} /></Field><DialogFooter><Button className="rounded-xl" onClick={() => onSave(name)}>Сохранить</Button></DialogFooter></div>;
}

function DisputeRuleEditor({ title, kind, value, onChange }: { title: string; kind: DecisionKind; value: DisputeRuleDraft; onChange: (value: DisputeRuleDraft) => void }) {
  const update = (patch: Partial<DisputeRuleDraft>) => onChange({ ...value, ...patch });
  const setExclusive = (patch: Partial<DisputeRuleDraft>) => onChange({ ...emptyDisputeRule, ...patch });
  return (
    <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">Соберите формулу чекбоксами; проценты задаются отдельными полями.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm"><Checkbox checked={value.none} onCheckedChange={(checked) => setExclusive({ none: checked === true })} />Ничего не списывать</label>
        <label className="flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm"><Checkbox checked={value.manual} onCheckedChange={(checked) => setExclusive({ manual: checked === true })} />Ручной режим</label>
        {kind === "RETURN" && (
          <>
            <label className="flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm"><Checkbox checked={value.cost} onCheckedChange={(checked) => update({ none: false, manual: false, cost: checked === true })} />Себестоимость</label>
            <label className="flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm"><Checkbox checked={value.work} onCheckedChange={(checked) => update({ none: false, manual: false, work: checked === true })} />Работа</label>
            <label className="flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm"><Checkbox checked={value.retail} onCheckedChange={(checked) => update({ none: false, manual: false, retail: checked === true })} />Розничная цена</label>
            <div className="grid gap-2 rounded-xl border bg-background/60 p-3">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.retailPercentEnabled} onCheckedChange={(checked) => update({ none: false, manual: false, retailPercentEnabled: checked === true })} />Процент от розницы</label>
              <Input className="h-10 rounded-xl" inputMode="numeric" value={value.retailPercent} onChange={(event) => update({ retailPercent: event.target.value })} />
            </div>
          </>
        )}
        {kind === "COUPON" && (
          <>
            <div className="grid gap-2 rounded-xl border bg-background/60 p-3">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.damagePercentEnabled} onCheckedChange={(checked) => update({ none: false, manual: false, damagePercentEnabled: checked === true })} />Процент от ущерба</label>
              <Input className="h-10 rounded-xl" inputMode="numeric" value={value.damagePercent} onChange={(event) => update({ damagePercent: event.target.value })} />
            </div>
            <label className="flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm"><Checkbox checked={value.fullDamage} onCheckedChange={(checked) => update({ none: false, manual: false, fullDamage: checked === true })} />Полный ущерб</label>
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Итоговая логика: {getDisputeRuleSummary(value)}</p>
    </div>
  );
}

function CourierStatusRuleForm({ rule, currentUser }: { rule?: AppState["statusRules"][number]; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: rule?.name ?? "", minPercent: String(rule?.minPercent ?? 0), maxPercent: rule?.maxPercent === null || rule?.maxPercent === undefined ? "" : String(rule.maxPercent), description: rule?.description ?? "", paysWhat: rule?.paysWhat ?? "", manualMode: rule?.manualMode ?? false, workBlocked: rule?.workBlocked ?? false, blockPayouts: rule?.blockPayouts ?? false, payoutLimit: rule?.payoutLimit === null || rule?.payoutLimit === undefined ? "" : String(rule.payoutLimit), depositRequired: String(rule?.depositRequired ?? 0), extraCriteria: rule?.extraCriteria ?? "" });
  const [returnRules, setReturnRules] = useState(() => parseDisputeRule(rule?.returnRules, { none: true }));
  const [couponRules, setCouponRules] = useState(() => parseDisputeRule(rule?.couponRules, { none: true }));
  const save = useMutation({
    mutationFn: () => {
      const payload = { actorLogin: currentUser.login, name: form.name, minPercent: Number(form.minPercent), maxPercent: form.maxPercent ? Number(form.maxPercent) : null, description: form.description, paysWhat: form.paysWhat, returnRules: toApiDisputeRule(returnRules), couponRules: toApiDisputeRule(couponRules), manualMode: form.manualMode, workBlocked: form.workBlocked, blockPayouts: form.blockPayouts, payoutLimit: form.payoutLimit ? Number(form.payoutLimit) : null, depositRequired: Number(form.depositRequired || 0), extraCriteria: form.extraCriteria };
      return rule ? client.updateCourierStatusRule({ ...payload, id: rule.id }) : client.createCourierStatusRule(payload);
    },
    onSuccess: () => { toast.success(rule ? "Статус курьера сохранён" : "Статус курьера добавлен"); queryClient.invalidateQueries({ queryKey: ["appState"] }); },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Название"><Input className="h-11 rounded-xl" value={form.name} onChange={(event) => setForm((item) => ({ ...item, name: event.target.value }))} /></Field>
        <Field label="Что платит курьер"><Input className="h-11 rounded-xl" value={form.paysWhat} onChange={(event) => setForm((item) => ({ ...item, paysWhat: event.target.value }))} /></Field>
        <Field label="Мин %"><Input className="h-11 rounded-xl" inputMode="decimal" value={form.minPercent} onChange={(event) => setForm((item) => ({ ...item, minPercent: event.target.value }))} /></Field>
        <Field label="Макс %"><Input className="h-11 rounded-xl" inputMode="decimal" value={form.maxPercent} onChange={(event) => setForm((item) => ({ ...item, maxPercent: event.target.value }))} /></Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DisputeRuleEditor title="Логика при решении Возврат" kind="RETURN" value={returnRules} onChange={setReturnRules} />
        <DisputeRuleEditor title="Логика при решении Купон" kind="COUPON" value={couponRules} onChange={setCouponRules} />
      </div>
      <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.manualMode} onCheckedChange={(checked) => setForm((item) => ({ ...item, manualMode: checked === true }))} />Ручной режим статуса</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.workBlocked} onCheckedChange={(checked) => setForm((item) => ({ ...item, workBlocked: checked === true }))} />Блокировка работы</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.blockPayouts} onCheckedChange={(checked) => setForm((item) => ({ ...item, blockPayouts: checked === true }))} />Блокировка выплат</label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Ограничение выплат"><Input className="h-11 rounded-xl" inputMode="numeric" value={form.payoutLimit} onChange={(event) => setForm((item) => ({ ...item, payoutLimit: event.target.value }))} /></Field>
        <Field label="Сумма залога"><Input className="h-11 rounded-xl" inputMode="numeric" value={form.depositRequired} onChange={(event) => setForm((item) => ({ ...item, depositRequired: event.target.value }))} /></Field>
        <Field label="Описание"><Textarea className="rounded-xl" value={form.description} onChange={(event) => setForm((item) => ({ ...item, description: event.target.value }))} /></Field>
        <Field label="Дополнительные критерии"><Textarea className="rounded-xl" value={form.extraCriteria} onChange={(event) => setForm((item) => ({ ...item, extraCriteria: event.target.value }))} /></Field>
      </div>
      <DialogFooter><Button className="rounded-xl" onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button></DialogFooter>
    </div>
  );
}

function SettingsSection({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const [cityName, setCityName] = useState("");
  const [mpName, setMpName] = useState("");
  const [mpDrafts, setMpDrafts] = useState<Record<string, { name: string; status: string }>>({});
  const [problem, setProblem] = useState("");
  const [decisionName, setDecisionName] = useState("");
  const handSetting = state.settings.find((item) => item.key === "handLimitRules")?.value;
  const bonusSetting = state.settings.find((item) => item.key === "bonusRules")?.value;
  const initialHandRules = safeJson<Array<{ minDisputePercent?: number; maxDisputePercent?: number; maxHandPercent?: number; payoutLimit?: number; blockPayouts?: boolean }>>(handSetting, [{ maxDisputePercent: 10, maxHandPercent: 80 }, { maxDisputePercent: 20, maxHandPercent: 50 }, { maxDisputePercent: 999, maxHandPercent: 20 }]).map((rule, index, all) => ({ minDisputePercent: String(rule.minDisputePercent ?? (index === 0 ? 0 : all[index - 1]?.maxDisputePercent ?? 0)), maxDisputePercent: String(rule.maxDisputePercent ?? 999), maxHandPercent: String(rule.maxHandPercent ?? 20), payoutLimit: rule.payoutLimit ? String(rule.payoutLimit) : "", blockPayouts: rule.blockPayouts ?? false }));
  const initialBonus = safeJson<{ period?: string; maxPercent?: number; depositMskSpb?: number; depositRegions?: number; addressThreshold?: number; rules?: Array<{ name?: string; enabled?: boolean; bonusPercent?: number; minAddresses?: number; maxDisputePercent?: number; depositRequired?: number; logic?: string }> }>(bonusSetting, {});
  const [handRules, setHandRules] = useState<HandLimitDraft[]>(initialHandRules);
  const [bonusDraft, setBonusDraft] = useState<BonusDraft>({ period: initialBonus.period ?? "MONTH", maxPercent: String(initialBonus.maxPercent ?? 15), depositMskSpb: String(initialBonus.depositMskSpb ?? 250000), depositRegions: String(initialBonus.depositRegions ?? 350000), rules: (initialBonus.rules?.length ? initialBonus.rules : [{ name: "+5%", bonusPercent: 5, minAddresses: 0, maxDisputePercent: 10, depositRequired: initialBonus.depositMskSpb ?? 250000, logic: "Начислить при диспутах до 10%" }, { name: "+10%", bonusPercent: 10, minAddresses: initialBonus.addressThreshold ?? 600, maxDisputePercent: 999, depositRequired: initialBonus.depositMskSpb ?? 250000, logic: "Начислить при выполнении порога адресов за месяц" }]).map((rule) => ({ name: rule.name ?? "+ бонус", enabled: rule.enabled !== false, bonusPercent: String(rule.bonusPercent ?? 0), minAddresses: String(rule.minAddresses ?? 0), maxDisputePercent: String(rule.maxDisputePercent ?? 999), depositRequired: String(rule.depositRequired ?? initialBonus.depositMskSpb ?? 250000), logic: rule.logic ?? "" })) });
  const createCity = useMutation({ mutationFn: () => client.createCity({ actorLogin: currentUser.login, name: cityName }), onSuccess: () => { toast.success("Город создан с 15 товарами"); setCityName(""); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const saveMp = useMutation({ mutationFn: (id?: string) => { const values = id ? mpDrafts[id] : undefined; return client.upsertMarketplace({ actorLogin: currentUser.login, id, name: values?.name ?? mpName, status: values?.status ?? "ACTIVE" }); }, onSuccess: () => { toast.success("МП сохранён"); setMpName(""); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const addProblem = useMutation({ mutationFn: () => client.addProblemType({ actorLogin: currentUser.login, name: problem }), onSuccess: () => { toast.success("Тип проблемы добавлен"); setProblem(""); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const updateProblem = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => client.updateProblemType({ actorLogin: currentUser.login, id, name }), onSuccess: () => { toast.success("Тип проблемы сохранён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const addDecision = useMutation({ mutationFn: () => client.addDisputeDecision({ actorLogin: currentUser.login, name: decisionName, calcType: "MANUAL", manualAmount: 0 }), onSuccess: () => { toast.success("Решение добавлено"); setDecisionName(""); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const updateDecision = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => client.updateDisputeDecision({ actorLogin: currentUser.login, id, name }), onSuccess: () => { toast.success("Решение сохранено"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const saveHandRules = useMutation({ mutationFn: () => client.updateHandLimitRules({ actorLogin: currentUser.login, rules: handRules.map((rule) => ({ minDisputePercent: Number(rule.minDisputePercent), maxDisputePercent: Number(rule.maxDisputePercent), maxHandPercent: Number(rule.maxHandPercent), payoutLimit: rule.payoutLimit ? Number(rule.payoutLimit) : undefined, blockPayouts: rule.blockPayouts })) }), onSuccess: () => { toast.success("Лимиты сохранены"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const saveBonusRules = useMutation({ mutationFn: () => client.updateBonusRules({ actorLogin: currentUser.login, settings: { period: bonusDraft.period, maxPercent: Number(bonusDraft.maxPercent), depositMskSpb: Number(bonusDraft.depositMskSpb), depositRegions: Number(bonusDraft.depositRegions), rules: bonusDraft.rules.map((rule) => ({ name: rule.name, enabled: rule.enabled, bonusPercent: Number(rule.bonusPercent), minAddresses: Number(rule.minAddresses), maxDisputePercent: Number(rule.maxDisputePercent), depositRequired: Number(rule.depositRequired), logic: rule.logic })) } }), onSuccess: () => { toast.success("Бонусы сохранены"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const restoreStatuses = useMutation({ mutationFn: () => client.restoreDefaultCourierStatusRules({ actorLogin: currentUser.login }), onSuccess: (result) => { toast.success(result.restored.length > 0 ? `Восстановлены статусы: ${result.restored.join(", ")}` : "Все прежние статусы уже есть"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteCity = useMutation({ mutationFn: (city: AppState["cities"][number]) => client.deleteCity({ actorLogin: currentUser.login, id: city.id }), onSuccess: (result) => { toast.success(deleteResultMessage(result, "Город удалён", "Город используется в истории — он отключён")); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteMp = useMutation({ mutationFn: (mp: AppState["marketplaces"][number]) => client.deleteMarketplace({ actorLogin: currentUser.login, id: mp.id }), onSuccess: (result) => { toast.success(deleteResultMessage(result, "МП удалён", "МП используется в истории — он отключён")); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteStatus = useMutation({ mutationFn: (rule: AppState["statusRules"][number]) => client.deleteCourierStatusRule({ actorLogin: currentUser.login, id: rule.id }), onSuccess: () => { toast.success("Статус курьера удалён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteProblem = useMutation({ mutationFn: (item: AppState["problemTypes"][number]) => client.deleteProblemType({ actorLogin: currentUser.login, id: item.id }), onSuccess: () => { toast.success("Тип проблемы удалён"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const deleteDecision = useMutation({ mutationFn: (item: AppState["decisions"][number]) => client.deleteDisputeDecision({ actorLogin: currentUser.login, id: item.id }), onSuccess: () => { toast.success("Решение диспута удалено"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });

  return (
    <Tabs defaultValue="cities" className="space-y-6">
      <TabsList className="h-auto flex-wrap justify-start rounded-2xl p-1"><TabsTrigger value="cities">Города</TabsTrigger><TabsTrigger value="marketplaces">МП</TabsTrigger><TabsTrigger value="bonus">Бонусы</TabsTrigger><TabsTrigger value="statuses">Статусы курьера</TabsTrigger><TabsTrigger value="problems">Типы проблем</TabsTrigger><TabsTrigger value="decisions">Решения диспутов</TabsTrigger></TabsList>
      <TabsContent value="cities" className="space-y-4"><Card className="rounded-[20px]"><CardHeader><CardTitle>Города</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-3"><Input className="h-11 rounded-xl text-base" placeholder="Название города" value={cityName} onChange={(event) => setCityName(event.target.value)} /><Button className="rounded-xl" onClick={() => createCity.mutate()} disabled={createCity.isPending}>Добавить</Button></div><p className="text-sm text-muted-foreground">Новый город получает 15 товаров, цены розницы до 10 г и партий от 5 до 500 г.</p><div className="overflow-hidden rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Город</TableHead><TableHead>Статус</TableHead><TableHead>Товары</TableHead><TableHead>Действие</TableHead></TableRow></TableHeader><TableBody>{state.cities.map((city) => <TableRow key={city.id}><TableCell className="font-medium">{city.name}</TableCell><TableCell><StatusBadge status={city.status} /></TableCell><TableCell>{state.citySettings.filter((item) => item.cityId === city.id && item.status === "ACTIVE").length} вкл.</TableCell><TableCell><div className="flex flex-wrap gap-2"><ActionDialog title={`Редактировать город: ${city.name}`} description="Товары, цены за работу, розница/партии, надбавки и вкл/выкл товара." trigger={<Button size="sm" variant="outline" className="rounded-xl">Редактировать</Button>}><CitySettingsDialog state={state} currentUser={currentUser} city={city} /></ActionDialog><Button size="sm" variant="destructive" className="rounded-xl" onClick={() => confirmDelete(city.name) && deleteCity.mutate(city)}>Удалить</Button></div></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></TabsContent>
      <TabsContent value="marketplaces" className="space-y-4"><Card className="rounded-[20px]"><CardHeader><CardTitle>МП</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-3"><Input className="h-11 rounded-xl text-base" placeholder="Название МП" value={mpName} onChange={(event) => setMpName(event.target.value)} /><Button className="rounded-xl" onClick={() => saveMp.mutate(undefined)}>Добавить</Button></div><div className="grid gap-2">{state.marketplaces.map((mp) => { const values = mpDrafts[mp.id] ?? { name: mp.name, status: mp.status }; return <div key={mp.id} className="grid gap-3 rounded-2xl border p-3 md:grid-cols-[1fr_160px_110px_100px]"><Input className="h-10 rounded-xl text-base" value={values.name} onChange={(event) => setMpDrafts((all) => ({ ...all, [mp.id]: { ...values, name: event.target.value } }))} /><Select value={values.status} onValueChange={(value) => setMpDrafts((all) => ({ ...all, [mp.id]: { ...values, status: value } }))}><SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Активен</SelectItem><SelectItem value="INACTIVE">Отключён</SelectItem></SelectContent></Select><Button variant="outline" className="rounded-xl" onClick={() => saveMp.mutate(mp.id)}>Сохранить</Button><Button variant="destructive" className="rounded-xl" onClick={() => confirmDelete(mp.name) && deleteMp.mutate(mp)}>Удалить</Button></div>; })}</div></CardContent></Card></TabsContent>
      <TabsContent value="bonus" className="space-y-4"><Card className="rounded-[20px]"><CardHeader><CardTitle>Лимиты на руки</CardTitle></CardHeader><CardContent className="space-y-3">{handRules.map((rule, index) => <div key={index} className="grid gap-3 rounded-2xl border p-3 lg:grid-cols-[110px_110px_120px_140px_160px_auto]"><Field label="% от"><Input className="h-10 rounded-xl" inputMode="decimal" value={rule.minDisputePercent} onChange={(event) => setHandRules((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, minDisputePercent: event.target.value } : item))} /></Field><Field label="% до"><Input className="h-10 rounded-xl" inputMode="decimal" value={rule.maxDisputePercent} onChange={(event) => setHandRules((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, maxDisputePercent: event.target.value } : item))} /></Field><Field label="Макс на руки %"><Input className="h-10 rounded-xl" inputMode="numeric" value={rule.maxHandPercent} onChange={(event) => setHandRules((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, maxHandPercent: event.target.value } : item))} /></Field><Field label="Макс выплата"><Input className="h-10 rounded-xl" inputMode="numeric" value={rule.payoutLimit} onChange={(event) => setHandRules((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, payoutLimit: event.target.value } : item))} /></Field><label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={rule.blockPayouts} onCheckedChange={(checked) => setHandRules((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, blockPayouts: checked === true } : item))} />Блок выплат</label><Button variant="destructive" className="mt-6 rounded-xl" onClick={() => confirmDelete(`правило лимита ${index + 1}`) && setHandRules((all) => all.filter((_, itemIndex) => itemIndex !== index))}>Удалить</Button></div>)}<div className="flex gap-2"><Button variant="outline" className="rounded-xl" onClick={() => setHandRules((all) => [...all, { minDisputePercent: "0", maxDisputePercent: "999", maxHandPercent: "20", payoutLimit: "", blockPayouts: false }])}>Добавить правило</Button><Button className="rounded-xl" onClick={() => saveHandRules.mutate()}>Сохранить лимиты</Button></div></CardContent></Card><Card className="rounded-[20px]"><CardHeader><CardTitle>Бонусы</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Field label="Период"><Select value={bonusDraft.period} onValueChange={(value) => setBonusDraft((item) => ({ ...item, period: value }))}><SelectTrigger className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTH">Текущий месяц</SelectItem></SelectContent></Select></Field><Field label="Максимум бонуса %"><Input className="h-11 rounded-xl" inputMode="numeric" value={bonusDraft.maxPercent} onChange={(event) => setBonusDraft((item) => ({ ...item, maxPercent: event.target.value }))} /></Field><Field label="Залог МСК/СПб"><Input className="h-11 rounded-xl" inputMode="numeric" value={bonusDraft.depositMskSpb} onChange={(event) => setBonusDraft((item) => ({ ...item, depositMskSpb: event.target.value }))} /></Field></div><div className="grid gap-4 md:grid-cols-2">{bonusDraft.rules.map((rule, index) => <div key={rule.name} className="space-y-3 rounded-2xl border p-4"><div className="flex items-center justify-between"><p className="text-lg font-semibold">{rule.name}</p><Checkbox checked={rule.enabled} onCheckedChange={(checked) => setBonusDraft((draft) => ({ ...draft, rules: draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked === true } : item) }))} /></div><Field label="Сумма/процент бонуса"><Input className="h-10 rounded-xl" inputMode="numeric" value={rule.bonusPercent} onChange={(event) => setBonusDraft((draft) => ({ ...draft, rules: draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, bonusPercent: event.target.value } : item) }))} /></Field><Field label="Количество адресов"><Input className="h-10 rounded-xl" inputMode="numeric" value={rule.minAddresses} onChange={(event) => setBonusDraft((draft) => ({ ...draft, rules: draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, minAddresses: event.target.value } : item) }))} /></Field><Field label="% диспутов до"><Input className="h-10 rounded-xl" inputMode="decimal" value={rule.maxDisputePercent} onChange={(event) => setBonusDraft((draft) => ({ ...draft, rules: draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, maxDisputePercent: event.target.value } : item) }))} /></Field><Field label="Залог"><Input className="h-10 rounded-xl" inputMode="numeric" value={rule.depositRequired} onChange={(event) => setBonusDraft((draft) => ({ ...draft, rules: draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, depositRequired: event.target.value } : item) }))} /></Field><Field label="Логика начисления"><Textarea className="rounded-xl" value={rule.logic} onChange={(event) => setBonusDraft((draft) => ({ ...draft, rules: draft.rules.map((item, itemIndex) => itemIndex === index ? { ...item, logic: event.target.value } : item) }))} /></Field><Button variant="destructive" className="w-full rounded-xl" onClick={() => confirmDelete(`бонус ${rule.name}`) && setBonusDraft((draft) => ({ ...draft, rules: draft.rules.filter((_, itemIndex) => itemIndex !== index) }))}>Удалить бонус</Button></div>)}</div><div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-xl" onClick={() => setBonusDraft((draft) => ({ ...draft, rules: [...draft.rules, { name: "+ бонус", enabled: true, bonusPercent: "0", minAddresses: "0", maxDisputePercent: "999", depositRequired: draft.depositMskSpb, logic: "" }] }))}>Добавить бонус</Button><Button className="rounded-xl" onClick={() => saveBonusRules.mutate()}>Сохранить бонусы</Button></div></CardContent></Card></TabsContent>
      <TabsContent value="statuses">
        <Card className="rounded-[20px]">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Статусы курьера</CardTitle>
              <p className="text-sm text-muted-foreground">Добавляйте, редактируйте, удаляйте статусы и восстанавливайте прежний набор без удаления пользовательских статусов.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionDialog title="Добавить статус курьера" trigger={<Button className="rounded-xl">Добавить статус</Button>}>
                <CourierStatusRuleForm currentUser={currentUser} />
              </ActionDialog>
              <Button variant="outline" className="rounded-xl" onClick={() => restoreStatuses.mutate()} disabled={restoreStatuses.isPending}>Восстановить прежние</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden rounded-2xl border p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Статус</TableHead><TableHead>% от</TableHead><TableHead>% до</TableHead><TableHead>Возврат</TableHead><TableHead>Купон</TableHead><TableHead>Блок работы</TableHead><TableHead>Действие</TableHead></TableRow></TableHeader>
              <TableBody>{state.statusRules.map((rule) => <TableRow key={rule.id}><TableCell>{rule.name}</TableCell><TableCell>{rule.minPercent}</TableCell><TableCell>{rule.maxPercent ?? "∞"}</TableCell><TableCell>{getDisputeRuleSummary(parseDisputeRule(rule.returnRules, { none: true }))}</TableCell><TableCell>{getDisputeRuleSummary(parseDisputeRule(rule.couponRules, { none: true }))}</TableCell><TableCell>{rule.workBlocked || rule.blockPayouts ? "Да" : "Нет"}</TableCell><TableCell><div className="flex flex-wrap gap-2"><ActionDialog title={`Редактировать статус: ${rule.name}`} trigger={<Button size="sm" variant="outline" className="rounded-xl">Редактировать</Button>}><CourierStatusRuleForm rule={rule} currentUser={currentUser} /></ActionDialog><Button size="sm" variant="destructive" className="rounded-xl" onClick={() => confirmDelete(rule.name) && deleteStatus.mutate(rule)}>Удалить</Button></div></TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="problems"><Card className="rounded-[20px]"><CardHeader><CardTitle>Типы проблем</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-3"><Input className="h-11 rounded-xl text-base" placeholder="Тип проблемы" value={problem} onChange={(event) => setProblem(event.target.value)} /><Button className="rounded-xl" onClick={() => addProblem.mutate()}>Добавить</Button></div><div className="overflow-hidden rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Название</TableHead><TableHead>Действие</TableHead></TableRow></TableHeader><TableBody>{state.problemTypes.map((item) => <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell><div className="flex flex-wrap gap-2"><ActionDialog title="Редактировать тип проблемы" trigger={<Button size="sm" variant="outline" className="rounded-xl">Редактировать</Button>}><SimpleNameForm label="Название" initialName={item.name} onSave={(name) => updateProblem.mutate({ id: item.id, name })} /></ActionDialog><Button size="sm" variant="destructive" className="rounded-xl" onClick={() => confirmDelete(item.name) && deleteProblem.mutate(item)}>Удалить</Button></div></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></TabsContent>
      <TabsContent value="decisions"><Card className="rounded-[20px]"><CardHeader><CardTitle>Решения диспутов</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-3"><Input className="h-11 rounded-xl text-base" placeholder="Название решения" value={decisionName} onChange={(event) => setDecisionName(event.target.value)} /><Button className="rounded-xl" onClick={() => addDecision.mutate()}>Добавить</Button></div><div className="overflow-hidden rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Решение</TableHead><TableHead>Действие</TableHead></TableRow></TableHeader><TableBody>{state.decisions.map((item) => <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell><div className="flex flex-wrap gap-2"><ActionDialog title="Редактировать решение диспута" trigger={<Button size="sm" variant="outline" className="rounded-xl">Редактировать</Button>}><SimpleNameForm label="Название" initialName={item.name} onSave={(name) => updateDecision.mutate({ id: item.id, name })} /></ActionDialog><Button size="sm" variant="destructive" className="rounded-xl" onClick={() => confirmDelete(item.name) && deleteDecision.mutate(item)}>Удалить</Button></div></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></TabsContent>
    </Tabs>
  );
}

function Logs({ state, currentUser }: { state: AppState; currentUser: Employee }) {
  const queryClient = useQueryClient();
  const initialRange = currentMonthRange();
  const [period, setPeriod] = useState(initialRange);
  const clear = useMutation({ mutationFn: () => client.clearLogs({ actorLogin: currentUser.login }), onSuccess: () => { toast.success("История логов очищена"); queryClient.invalidateQueries({ queryKey: ["appState"] }); }, onError: (error) => toast.error(error.message) });
  const logs = state.logs.filter((log) => inRange(log.createdAt, period.from, period.to));
  return (
    <Card className="rounded-[20px]">
      <CardHeader className="flex flex-row items-center justify-between gap-4"><div><CardTitle>Логи</CardTitle><p className="text-sm text-muted-foreground">Отдельные записи нельзя редактировать или удалять.</p></div><Button variant="destructive" className="rounded-xl" onClick={() => clear.mutate()}>Очистить историю логов</Button></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2"><Field label="Дата от"><Input className="h-11 rounded-xl text-base" type="date" value={period.from} onChange={(event) => setPeriod((item) => ({ ...item, from: event.target.value }))} /></Field><Field label="Дата до"><Input className="h-11 rounded-xl text-base" type="date" value={period.to} onChange={(event) => setPeriod((item) => ({ ...item, to: event.target.value }))} /></Field></div>
        <div className="overflow-hidden rounded-2xl border p-0"><Table><TableHeader><TableRow><TableHead>Пользователь</TableHead><TableHead>Действие</TableHead><TableHead>Раздел</TableHead><TableHead>Дата/время</TableHead><TableHead>Детали</TableHead><TableHead>Старое/новое</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell>{log.userLogin}</TableCell><TableCell>{log.action}</TableCell><TableCell>{log.entity}</TableCell><TableCell>{formatDate(log.createdAt)}</TableCell><TableCell className="max-w-sm truncate text-muted-foreground">{log.details}</TableCell><TableCell className="max-w-sm truncate text-muted-foreground">{log.oldValue || log.newValue ? "есть" : "—"}</TableCell></TableRow>)}</TableBody></Table></div>
      </CardContent>
    </Card>
  );
}

function AppShell({ currentUser, onLogout }: { currentUser: Employee; onLogout: () => void }) {
  const [active, setActive] = useState<Section>(currentUser.role === "COURIER" || currentUser.role === "SUPPORT" ? "statistics" : "dashboard");
  const [theme, setTheme] = useState(() => localStorage.getItem("rick-crm-theme") ?? "dark");
  const stateQuery = useQuery({ queryKey: ["appState"], queryFn: () => client.getAppState() });

  useEffect(() => {
    localStorage.setItem("rick-crm-theme", theme);
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const visibleNav = navItems.filter((item) => item.roles.includes(currentUser.role as Role));
  useEffect(() => {
    if (!roleCan(currentUser.role, active)) setActive(visibleNav[0]?.id ?? "statistics");
  }, [active, currentUser.role, visibleNav]);

  if (stateQuery.isPending) return <main className="flex min-h-screen items-center justify-center"><Card className="rounded-[20px] p-8">Загружаю Rick CRM...</Card></main>;
  if (stateQuery.isError) return <main className="flex min-h-screen items-center justify-center"><Card className="rounded-[20px] p-8 text-red-500">Ошибка загрузки: {stateQuery.error.message}</Card></main>;
  const state = stateQuery.data;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r bg-sidebar/80 p-5 backdrop-blur lg:block">
          <div className="mb-8 rounded-[20px] border bg-card p-5 shadow-lg shadow-slate-950/5 dark:shadow-black/20">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500"><Shield /></div><div><p className="text-xl font-semibold">Rick</p><p className="text-sm text-muted-foreground">premium CRM</p></div></div>
          </div>
          <nav className="space-y-2">{visibleNav.map((item) => { const Icon = item.icon; return <button key={item.id} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition duration-300 ${active === item.id ? "bg-blue-500/12 text-blue-500 shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={() => setActive(item.id)}><Icon className="h-5 w-5" />{item.label}</button>; })}</nav>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b bg-background/85 px-5 py-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><h1 className="text-2xl font-semibold tracking-tight">{navItems.find((item) => item.id === active)?.label ?? "Rick CRM"}</h1><p className="text-sm text-muted-foreground">МСК · текущий месяц · роль: {roleLabels[currentUser.role]}</p></div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="rounded-full px-3 py-1.5">{currentUser.login}</Badge><Button variant="outline" size="icon" className="rounded-xl" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button><Button variant="outline" className="rounded-xl" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" />Выход</Button></div>
            </div>
          </header>
          <div className="border-b px-5 py-3 lg:hidden"><div className="flex gap-2 overflow-auto">{visibleNav.map((item) => <Button key={item.id} variant={active === item.id ? "default" : "outline"} className="rounded-xl" onClick={() => setActive(item.id)}>{item.label}</Button>)}</div></div>
          <div className="flex-1 p-5 lg:p-8">
            {active === "dashboard" && <Dashboard state={state} currentUser={currentUser} />}
            {active === "statistics" && <Statistics state={state} currentUser={currentUser} />}
            {active === "batches" && <Batches state={state} currentUser={currentUser} />}
            {active === "finance" && <Finance state={state} currentUser={currentUser} />}
            {active === "employees" && <Employees state={state} currentUser={currentUser} />}
            {active === "settings" && <SettingsSection state={state} currentUser={currentUser} />}
            {active === "logs" && <Logs state={state} currentUser={currentUser} />}
          </div>
        </section>
      </div>
      <Toaster richColors position="top-right" />
    </main>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    const stored = localStorage.getItem("rick-crm-session");
    if (!stored) return null;
    try {
      return JSON.parse(stored) as Employee;
    } catch {
      return null;
    }
  });

  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;
  return <AppShell currentUser={currentUser} onLogout={() => { localStorage.removeItem("rick-crm-session"); setCurrentUser(null); }} />;
}

export default App;
