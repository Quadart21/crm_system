import { db } from "@/api/db";
import { env } from "@/lib/env";

type Role = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "COURIER";
type Mode = "RETAIL" | "BATCH";
type IssueKind = "TICKET" | "DISPUTE";
type DisputeDecisionKind = "RETURN" | "COUPON" | "MANUAL";
type DisputeLogic = "NONE" | "COST" | "WORK" | "COST_PLUS_WORK" | "RETAIL" | "RETAIL_PERCENT" | "DAMAGE_PERCENT" | "FULL_DAMAGE" | "MANUAL";

type MarketplaceDistribution = Record<string, number>;
type DashboardGroupBy = "day" | "week" | "month";

type HandLimitRule = {
  minDisputePercent?: number;
  maxDisputePercent: number;
  maxHandPercent: number;
  payoutLimit?: number;
  blockPayouts?: boolean;
};

type BonusRule = {
  name: string;
  enabled?: boolean;
  bonusPercent: number;
  minAddresses?: number;
  maxDisputePercent?: number;
  depositRequired?: number;
  logic?: string;
};

type BonusSettings = {
  period?: string;
  addressThreshold?: number;
  maxPercent?: number;
  depositMskSpb?: number;
  depositRegions?: number;
  rules?: BonusRule[];
};

type DisputeRuleConfig = {
  none?: boolean;
  cost?: boolean;
  work?: boolean;
  retail?: boolean;
  retailPercentEnabled?: boolean;
  retailPercent?: number;
  damagePercentEnabled?: boolean;
  damagePercent?: number;
  fullDamage?: boolean;
  manual?: boolean;
};

const DISPUTE_LOGIC_VALUES = new Set<DisputeLogic>(["NONE", "COST", "WORK", "COST_PLUS_WORK", "RETAIL", "RETAIL_PERCENT", "DAMAGE_PERCENT", "FULL_DAMAGE", "MANUAL"]);

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeRuleConfig(config: DisputeRuleConfig | undefined, fallback: DisputeRuleConfig): DisputeRuleConfig {
  const source = config && typeof config === "object" ? config : fallback;
  return {
    none: Boolean(source.none),
    cost: Boolean(source.cost),
    work: Boolean(source.work),
    retail: Boolean(source.retail),
    retailPercentEnabled: Boolean(source.retailPercentEnabled),
    retailPercent: Number(source.retailPercent ?? 0),
    damagePercentEnabled: Boolean(source.damagePercentEnabled),
    damagePercent: Number(source.damagePercent ?? 0),
    fullDamage: Boolean(source.fullDamage),
    manual: Boolean(source.manual),
  };
}

function legacyLogicToRuleConfig(logic: string | null | undefined, percent = 0): DisputeRuleConfig {
  switch (normalizeDisputeLogic(logic)) {
    case "COST":
      return { cost: true };
    case "WORK":
      return { work: true };
    case "COST_PLUS_WORK":
      return { cost: true, work: true };
    case "RETAIL":
      return { retail: true };
    case "RETAIL_PERCENT":
      return { retailPercentEnabled: true, retailPercent: percent };
    case "DAMAGE_PERCENT":
      return { damagePercentEnabled: true, damagePercent: percent };
    case "FULL_DAMAGE":
      return { fullDamage: true };
    case "MANUAL":
      return { manual: true };
    case "NONE":
    default:
      return { none: true };
  }
}

const PRODUCT_NAMES = Array.from({ length: 15 }, (_, index) => `Товар ${index + 1}`);
const PRICE_ROWS: Array<[number, Array<number | null>]> = [
  [0.1, [300, 500, 200, 200, 200, 200, 200, 150, null, null, null, 150, 450, 450, 500]],
  [0.25, [400, 900, 350, 350, 350, 350, 350, 300, null, null, null, 300, 700, 700, 900]],
  [0.5, [700, 1500, 650, 650, 650, 650, 650, 600, null, null, null, 600, 1000, 1000, 1500]],
  [1, [1000, 2000, 900, 900, 900, 900, 900, 800, 800, 800, 800, 800, 1300, 1300, 2000]],
  [2, [1200, 3000, 1000, 1000, 1000, 1000, 1000, 900, 900, 900, 900, 900, 1800, 1800, 3000]],
  [3, [1300, 3500, 1100, 1100, 1100, 1100, 1100, 1000, 1000, 1000, 1000, 1000, 2300, 2300, 3500]],
  [5, [1500, 4500, 1300, 1300, 1300, 1300, 1300, 1100, 1200, 1200, 1200, 1200, 2800, 2800, 4500]],
  [10, [1700, 6000, 1500, 1500, 1500, 1500, 1500, 1300, 1400, 1400, 1400, 1400, 3500, 3500, 6000]],
  [20, [2200, 7500, 1900, 1900, 1900, 1900, 1900, 1500, 1600, 1600, 1600, 1600, 4000, 4000, 7500]],
  [30, [2600, 9000, 2400, 2400, 2400, 2400, 2400, 1600, 1800, 1800, 1800, 1800, 4500, 4500, 9000]],
  [50, [3500, 11000, 2800, 2800, 2800, 2800, 2800, 1800, 2500, 2500, 2500, 2500, 5000, 5000, 11000]],
  [100, [6500, 14000, 5500, 5500, 5500, 5500, 5500, 3000, 5000, 5000, 5000, 5000, 8000, 8000, 14000]],
  [200, [10000, 20000, 8000, 8000, 8000, 8000, 8000, 5000, 7000, 7000, 7000, 7000, 13000, 13000, 20000]],
  [300, [13000, 23000, 10000, 10000, 10000, 10000, 10000, 6000, 8000, 8000, 8000, 8000, 16000, 16000, 23000]],
  [500, [15000, 28000, 12000, 12000, 12000, 12000, 12000, 7000, 10000, 10000, 10000, 10000, 20000, 20000, 28000]],
];

const DEFAULT_RETAIL_TYPES = ["Розница Тип-1", "Розница Тип-2", "Розница Тип-3"];
const DEFAULT_BATCH_TYPES = ["Партия Тип-1", "Партия Тип-2", "Партия Тип-3"];

type DefaultCourierStatusRule = {
  name: string;
  minPercent: number;
  maxPercent: number | null;
  description: string;
  paysWhat: string;
  returnRules: DisputeRuleConfig;
  returnLogic: DisputeLogic;
  returnPercent?: number;
  couponRules: DisputeRuleConfig;
  couponLogic: DisputeLogic;
  couponPercent?: number;
  manualMode?: boolean;
  workBlocked?: boolean;
  blockPayouts?: boolean;
  payoutLimit?: number | null;
  depositRequired?: number;
  extraCriteria?: string | null;
};

const DEFAULT_COURIER_STATUS_RULES: DefaultCourierStatusRule[] = [
  { name: "Зелёный", minPercent: 0, maxPercent: 10, description: "До 10% диспутов", paysWhat: "Ничего не платит, риски на системе", returnRules: { none: true }, returnLogic: "NONE", couponRules: { none: true }, couponLogic: "NONE" },
  { name: "Жёлтый", minPercent: 10.01, maxPercent: 15, description: "10–15% диспутов", paysWhat: "Возврат: себестоимость + работа; купон: 50% ущерба", returnRules: { cost: true, work: true }, returnLogic: "COST_PLUS_WORK", couponRules: { damagePercentEnabled: true, damagePercent: 50 }, couponLogic: "DAMAGE_PERCENT", couponPercent: 50 },
  { name: "Оранжевый", minPercent: 15.01, maxPercent: 25, description: "15–25% диспутов", paysWhat: "Возврат: розничная цена; купон: полный ущерб", returnRules: { retail: true }, returnLogic: "RETAIL", couponRules: { fullDamage: true }, couponLogic: "FULL_DAMAGE", payoutLimit: 20 },
  { name: "Красный", minPercent: 25.01, maxPercent: 35, description: ">25% диспутов", paysWhat: "Ручной штраф", returnRules: { manual: true }, returnLogic: "MANUAL", couponRules: { manual: true }, couponLogic: "MANUAL", blockPayouts: true, workBlocked: true },
  { name: "Критический", minPercent: 35.01, maxPercent: null, description: ">35% диспутов", paysWhat: "Курьер под увольнение", returnRules: { manual: true }, returnLogic: "MANUAL", couponRules: { manual: true }, couponLogic: "MANUAL", blockPayouts: true, workBlocked: true },
];

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function statusRuleSeedToCreateData(rule: DefaultCourierStatusRule) {
  return {
    name: rule.name,
    minPercent: rule.minPercent,
    maxPercent: rule.maxPercent,
    description: rule.description,
    paysWhat: rule.paysWhat,
    returnRules: json(normalizeRuleConfig(rule.returnRules, { none: true })),
    returnLogic: rule.returnLogic,
    returnPercent: rule.returnPercent ?? 0,
    couponRules: json(normalizeRuleConfig(rule.couponRules, { none: true })),
    couponLogic: rule.couponLogic,
    couponPercent: rule.couponPercent ?? 0,
    manualMode: rule.manualMode ?? false,
    workBlocked: rule.workBlocked ?? false,
    blockPayouts: rule.blockPayouts ?? false,
    payoutLimit: rule.payoutLimit ?? null,
    depositRequired: rule.depositRequired ?? 0,
    extraCriteria: rule.extraCriteria ?? null,
  };
}

function moscowMonthRange(reference = new Date()) {
  const moscow = new Date(reference.getTime() + 3 * 60 * 60 * 1000);
  const startUtc = Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), 1) - 3 * 60 * 60 * 1000;
  const endUtc = Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth() + 1, 1) - 3 * 60 * 60 * 1000;
  return { start: new Date(startUtc), end: new Date(endUtc) };
}

async function logAction(input: {
  userId?: string;
  userLogin?: string;
  action: string;
  entity: string;
  details: unknown;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  await db.appLog.create({
    data: {
      userId: input.userId,
      userLogin: input.userLogin ?? "system",
      action: input.action,
      entity: input.entity,
      details: json(input.details),
      oldValue: input.oldValue === undefined ? undefined : json(input.oldValue),
      newValue: input.newValue === undefined ? undefined : json(input.newValue),
    },
  });
}

async function ensureDefaultProducts() {
  for (const name of PRODUCT_NAMES) {
    await db.product.upsert({
      where: { name },
      create: { name, status: "ACTIVE" },
      update: {},
    });
  }
  return db.product.findMany({ orderBy: { name: "asc" } });
}

async function seedCityDefaults(cityId: string) {
  const products = await ensureDefaultProducts();
  for (const [productIndex, product] of products.entries()) {
    for (const mode of ["RETAIL", "BATCH"] as const) {
      await db.cityProductSetting.upsert({
        where: { cityId_productId_mode: { cityId, productId: product.id, mode } },
        create: { cityId, productId: product.id, mode, status: "ACTIVE" },
        update: {},
      });

      const typeNames = mode === "RETAIL" ? DEFAULT_RETAIL_TYPES : DEFAULT_BATCH_TYPES;
      const existingTypes = await db.stashType.count({ where: { cityId, productId: product.id, mode } });
      if (existingTypes === 0) {
        for (const [index, name] of typeNames.entries()) {
          await db.stashType.create({ data: { cityId, productId: product.id, mode, name, surcharge: index * 100 } });
        }
      }
    }

    for (const [weight, prices] of PRICE_ROWS) {
      const price = prices[productIndex];
      if (price == null) continue;
      const modes: Mode[] = [];
      if (weight <= 10) modes.push("RETAIL");
      if (weight >= 5) modes.push("BATCH");
      for (const mode of modes) {
        await db.priceRate.upsert({
          where: { cityId_productId_mode_weight: { cityId, productId: product.id, mode, weight } },
          create: { cityId, productId: product.id, mode, weight, price },
          update: { price },
        });
      }
    }
  }
}

async function ensureSeedData() {
  const employees = await db.employee.count();
  if (employees > 0) return;

  const superAdmin = await db.employee.create({
    data: { login: "Rick", password: "SuperRick", role: "SUPER_ADMIN", status: "ACTIVE" },
  });
  const admin = await db.employee.create({ data: { login: "admin", password: "admin123", role: "ADMIN", status: "ACTIVE" } });
  await db.employee.create({ data: { login: "support", password: "support123", role: "SUPPORT", status: "ACTIVE" } });
  const courier = await db.employee.create({
    data: { login: "courier", password: "courier123", role: "COURIER", status: "ACTIVE", depositBalance: 260000 },
  });

  const city = await db.city.create({ data: { name: "Москва", status: "ACTIVE" } });
  await seedCityDefaults(city.id);
  const products = await db.product.findMany({ orderBy: { name: "asc" } });

  for (const name of ["MP Alpha", "MP Beta", "MP Gamma"])
    await db.marketplace.create({ data: { name, status: "ACTIVE" } });
  for (const name of ["Возврат", "Купон", "Потеря", "Другое"])
    await db.problemType.create({ data: { name } });
  await db.disputeDecision.create({ data: { name: "Возврат", calcType: "COST" } });
  await db.disputeDecision.create({ data: { name: "Купон", calcType: "PERCENT", percent: 50 } });
  await db.disputeDecision.create({ data: { name: "Розница", calcType: "RETAIL" } });
  await db.disputeDecision.create({ data: { name: "Ручное решение", calcType: "MANUAL", manualAmount: 0 } });

  await db.courierStatusRule.createMany({
    data: DEFAULT_COURIER_STATUS_RULES.map(statusRuleSeedToCreateData),
  });

  await db.appSetting.createMany({
    data: [
      { key: "handLimitRules", value: json([{ maxDisputePercent: 10, maxHandPercent: 80 }, { maxDisputePercent: 20, maxHandPercent: 50 }, { maxDisputePercent: 999, maxHandPercent: 20 }]) },
      { key: "bonusRules", value: json({ period: "MONTH", addressThreshold: 600, maxPercent: 15, depositMskSpb: 250000, depositRegions: 350000 }) },
      { key: "disputeLogicDefaultsSeeded", value: "true" },
    ],
  });

  const batch = await db.batch.create({
    data: {
      name: "Партия тестовая 1",
      cityId: city.id,
      productId: products[0]?.id ?? "",
      weight: 500,
      totalBatchCost: 45000,
      warehouseWorkCost: 0,
      remainingGram: 500,
      costPerGram: 94,
      fasEnabled: true,
      fasCost: 2000,
      fasPackages: 100,
      status: "ISSUED",
      courierId: courier.id,
      issuedAt: new Date(),
    },
  });

  await createDataEntryInternal({
    actorLogin: admin.login,
    courierId: courier.id,
    batchId: batch.id,
    cityId: city.id,
    mode: "RETAIL",
    weightPerAddr: 1,
    stashTypeName: "Розница Тип-1",
    quantity: 12,
    mpDistribution: { "MP Alpha": 7, "MP Beta": 5 },
  });

  await logAction({ userId: superAdmin.id, userLogin: superAdmin.login, action: "seed", entity: "system", details: "Стартовые тестовые данные Rick CRM созданы" });
}

async function ensureDefaultCourierStatusRules(actorLogin = "system") {
  const created: string[] = [];
  for (const defaultRule of DEFAULT_COURIER_STATUS_RULES) {
    const existing = await db.courierStatusRule.findFirst({ where: { name: defaultRule.name } });
    if (existing) continue;
    const item = await db.courierStatusRule.create({ data: statusRuleSeedToCreateData(defaultRule) });
    created.push(item.name);
  }
  if (created.length > 0) {
    await logAction({ userLogin: actorLogin, action: "Восстановление статусов курьера", entity: "CourierStatusRule", details: { restored: created } });
  }
  return created;
}

function getDefaultDisputeLogic(rule: { minPercent: number; maxPercent: number | null }) {
  const min = rule.minPercent;
  const max = rule.maxPercent ?? 999;
  if (max <= 10) return { returnRules: { none: true }, returnLogic: "NONE", returnPercent: 0, couponRules: { none: true }, couponLogic: "NONE", couponPercent: 0, manualMode: false, workBlocked: false };
  if (min <= 15 && max <= 15) return { returnRules: { cost: true, work: true }, returnLogic: "COST_PLUS_WORK", returnPercent: 0, couponRules: { damagePercentEnabled: true, damagePercent: 50 }, couponLogic: "DAMAGE_PERCENT", couponPercent: 50, manualMode: false, workBlocked: false };
  if (min <= 25 && max <= 25) return { returnRules: { retail: true }, returnLogic: "RETAIL", returnPercent: 0, couponRules: { fullDamage: true }, couponLogic: "FULL_DAMAGE", couponPercent: 0, manualMode: false, workBlocked: false };
  return { returnRules: { manual: true }, returnLogic: "MANUAL", returnPercent: 0, couponRules: { manual: true }, couponLogic: "MANUAL", couponPercent: 0, manualMode: false, workBlocked: true };
}

async function ensureDefaultDisputeLogic() {
  const marker = await db.appSetting.findUnique({ where: { key: "disputeLogicDefaultsSeeded" } });
  if (marker?.value === "true") return;
  const rules = await db.courierStatusRule.findMany();
  for (const rule of rules) {
    const defaults = getDefaultDisputeLogic(rule);
    await db.courierStatusRule.update({
      where: { id: rule.id },
      data: { ...defaults, returnRules: json(defaults.returnRules), couponRules: json(defaults.couponRules), blockPayouts: rule.blockPayouts || defaults.workBlocked },
    });
  }
  await db.appSetting.upsert({ where: { key: "disputeLogicDefaultsSeeded" }, create: { key: "disputeLogicDefaultsSeeded", value: "true" }, update: { value: "true" } });
}

async function getCourierStats(courierId: string) {
  const { start, end } = moscowMonthRange();
  const entries = await db.dataEntry.findMany({ where: { courierId, createdAt: { gte: start, lt: end } } });
  const disputes = await db.issueRecord.count({ where: { courierId, kind: "DISPUTE", createdAt: { gte: start, lt: end } } });
  const addresses = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const percent = addresses > 0 ? (disputes / addresses) * 100 : 0;
  const status = await db.courierStatusRule.findFirst({
    where: { minPercent: { lte: percent }, OR: [{ maxPercent: null }, { maxPercent: { gte: percent } }] },
    orderBy: { minPercent: "desc" },
  });
  return { addresses, disputes, disputePercent: percent, statusName: status?.name ?? "Без статуса", status };
}

async function getHandLimit(courierId: string, earnings: number) {
  const stats = await getCourierStats(courierId);
  const setting = await db.appSetting.findUnique({ where: { key: "handLimitRules" } });
  const rules = setting ? (JSON.parse(setting.value) as HandLimitRule[]) : [];
  const normalized = rules
    .map((item, index) => ({
      minDisputePercent: item.minDisputePercent ?? (index === 0 ? 0 : rules[index - 1]?.maxDisputePercent ?? 0),
      maxDisputePercent: item.maxDisputePercent,
      maxHandPercent: item.maxHandPercent,
      payoutLimit: item.payoutLimit,
      blockPayouts: item.blockPayouts ?? false,
    }))
    .sort((a, b) => a.minDisputePercent - b.minDisputePercent);
  const rule = normalized.find((item) => stats.disputePercent >= item.minDisputePercent && stats.disputePercent <= item.maxDisputePercent) ?? { minDisputePercent: 0, maxDisputePercent: 999, maxHandPercent: 20, payoutLimit: undefined, blockPayouts: false };
  const percentMax = (earnings * rule.maxHandPercent) / 100;
  const maxHand = typeof rule.payoutLimit === "number" && rule.payoutLimit > 0 ? Math.min(percentMax, rule.payoutLimit) : percentMax;
  return { maxHand: rule.blockPayouts ? 0 : maxHand, maxPercent: rule.maxHandPercent, disputePercent: stats.disputePercent, blockPayouts: rule.blockPayouts };
}

async function requireActor(actorLogin: string, roles: Role[]) {
  const actor = await db.employee.findUnique({ where: { login: actorLogin } });
  if (!actor || actor.status !== "ACTIVE") throw new Error("Действующий сотрудник не найден");
  if (!roles.includes(actor.role as Role)) throw new Error("Недостаточно прав для действия");
  return actor;
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}: значение должно быть больше 0`);
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}: значение не может быть отрицательным`);
}

function assertMoneyEquals(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.01) throw new Error(`${label}: сумма должна быть ровно ${expected}`);
}

const WEIGHT_EPSILON = 0.000001;

function normalizeWeight(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function assertWeightWithinRemaining(grossWeight: number, remainingGram: number) {
  if (grossWeight - remainingGram > WEIGHT_EPSILON) throw new Error("Ввод превышает остаток партии");
}

function calculateRemainingAfterWeight(remainingGram: number, grossWeight: number) {
  const nextRemaining = normalizeWeight(remainingGram - grossWeight);
  return Math.abs(nextRemaining) <= WEIGHT_EPSILON ? 0 : nextRemaining;
}

function calculateRealCostPerGram(input: { totalBatchCost: number; weight: number; fasEnabled?: boolean; fasCost?: number; warehouseWorkCost?: number }) {
  assertPositive(input.totalBatchCost, "Цена товара");
  assertPositive(input.weight, "Вес партии");
  const fasCost = input.fasEnabled ? Number(input.fasCost ?? 0) : 0;
  const warehouseWorkCost = Number(input.warehouseWorkCost ?? 0);
  assertNonNegative(fasCost, "Стоимость ФАС");
  assertNonNegative(warehouseWorkCost, "Оплата работы склада");
  return (input.totalBatchCost + fasCost + warehouseWorkCost) / input.weight;
}

function dateRangeFromInput(from?: string, to?: string) {
  const now = new Date();
  const start = from ? new Date(`${from.slice(0, 10)}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.999Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function groupDateKey(value: Date, groupBy: DashboardGroupBy) {
  const date = new Date(value);
  if (groupBy === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  if (groupBy === "week") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}`;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseDistribution(value: string) {
  return safeParseJson<Record<string, number>>(value, {});
}

async function getCourierStatsForRange(courierId: string, start: Date, end: Date) {
  const entries = await db.dataEntry.findMany({ where: { courierId, createdAt: { gte: start, lte: end } } });
  const disputes = await db.issueRecord.count({ where: { courierId, kind: "DISPUTE", createdAt: { gte: start, lte: end } } });
  const addresses = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const disputePercent = addresses > 0 ? (disputes / addresses) * 100 : 0;
  const status = await db.courierStatusRule.findFirst({ where: { minPercent: { lte: disputePercent }, OR: [{ maxPercent: null }, { maxPercent: { gte: disputePercent } }] }, orderBy: { minPercent: "desc" } });
  return { addresses, disputes, disputePercent, statusName: status?.name ?? "Без статуса" };
}

async function getCourierStatusByPercent(disputePercent: number) {
  return db.courierStatusRule.findFirst({
    where: { minPercent: { lte: disputePercent }, OR: [{ maxPercent: null }, { maxPercent: { gte: disputePercent } }] },
    orderBy: { minPercent: "desc" },
  });
}

function validatePeriod(start: Date, end: Date) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Период указан некорректно");
  if (start.getTime() > end.getTime()) throw new Error("Дата от не может быть больше даты до");
}

async function getUsedIssueCountForEntry(input: { dataEntryId: string; marketplace?: string }) {
  const [issues, allocations] = await Promise.all([
    db.issueRecord.count({ where: { dataEntryId: input.dataEntryId, marketplace: input.marketplace } }),
    db.dataEntryIssueAllocation.count({ where: { dataEntryId: input.dataEntryId, marketplace: input.marketplace } }),
  ]);
  return Math.max(issues, allocations);
}

async function findFreeDataEntryForIssue(input: { courierId: string; batchId: string; cityId: string; productId: string; weight: number; stashType: string; marketplace: string }) {
  const requestedWeight = normalizeWeight(input.weight);
  const requestedStashType = input.stashType.trim();
  const requestedMarketplace = input.marketplace.trim();
  const entries = await db.dataEntry.findMany({
    where: {
      courierId: input.courierId,
      batchId: input.batchId,
      cityId: input.cityId,
      productId: input.productId,
    },
    orderBy: { createdAt: "asc" },
  });
  for (const entry of entries) {
    if (Math.abs(normalizeWeight(entry.weightPerAddr) - requestedWeight) > WEIGHT_EPSILON) continue;
    if (entry.stashTypeName.trim() !== requestedStashType) continue;
    const distribution = parseDistribution(entry.mpDistribution);
    const marketplaceQuantity = Number(distribution[requestedMarketplace] ?? 0);
    if (marketplaceQuantity <= 0) continue;
    const used = await getUsedIssueCountForEntry({ dataEntryId: entry.id, marketplace: requestedMarketplace });
    const free = marketplaceQuantity - used;
    if (free > 0) return { entry, marketplaceQuantity, used, free };
  }
  return null;
}

export async function previewIssueAllocation(input: { actorLogin: string; courierId: string; batchId: string; cityId: string; productId: string; weight: number; stashType: string; marketplace: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
  const result = await findFreeDataEntryForIssue(input);
  return result ? { found: true, dataEntryId: result.entry.id, free: result.free, marketplaceQuantity: result.marketplaceQuantity, used: result.used } : { found: false, dataEntryId: null, free: 0, marketplaceQuantity: 0, used: 0 };
}

async function createDataEntryInternal(input: {
  actorLogin: string;
  courierId: string;
  batchId: string;
  cityId: string;
  mode: Mode;
  weightPerAddr: number;
  stashTypeName: string;
  quantity: number;
  mpDistribution: MarketplaceDistribution;
}) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  const batch = await db.batch.findUnique({ where: { id: input.batchId } });
  if (!batch) throw new Error("Партия не найдена");
  if (batch.status !== "ISSUED") throw new Error("Ввод данных доступен только по выданной партии");
  if (batch.courierId !== input.courierId) throw new Error("Партия закреплена за другим курьером");
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  if (!city || city.status !== "ACTIVE") throw new Error("Город неактивен или не найден");
  const product = await db.product.findUnique({ where: { id: batch.productId } });
  if (!product || product.status !== "ACTIVE") throw new Error("Товар неактивен или не найден");
  const productSetting = await db.cityProductSetting.findUnique({ where: { cityId_productId_mode: { cityId: input.cityId, productId: batch.productId, mode: input.mode } } });
  if (!productSetting || productSetting.status !== "ACTIVE") throw new Error("Товар отключён для выбранного города/режима");
  assertPositive(input.weightPerAddr, "Вес одного адреса");
  assertPositive(input.quantity, "Количество адресов");
  const totalMp = Object.values(input.mpDistribution).reduce((sum, value) => sum + Number(value || 0), 0);
  if (totalMp !== input.quantity) throw new Error("Все адреса должны быть распределены по МП");
  const grossWeight = normalizeWeight(input.weightPerAddr * input.quantity);
  assertWeightWithinRemaining(grossWeight, batch.remainingGram);

  const productId = batch.productId;
  const rate = await db.priceRate.findUnique({
    where: { cityId_productId_mode_weight: { cityId: input.cityId, productId, mode: input.mode, weight: input.weightPerAddr } },
  });
  if (!rate) throw new Error("Для этой весовки нет цены");
  const stashType = await db.stashType.findFirst({ where: { cityId: input.cityId, productId, mode: input.mode, name: input.stashTypeName } });
  const earnings = (rate.price + (stashType?.surcharge ?? 0)) * input.quantity;

  const entry = await db.dataEntry.create({
    data: {
      courierId: input.courierId,
      batchId: input.batchId,
      cityId: input.cityId,
      productId,
      mode: input.mode,
      weightPerAddr: input.weightPerAddr,
      stashTypeName: input.stashTypeName,
      quantity: input.quantity,
      mpDistribution: json(input.mpDistribution),
      grossWeight,
      earnings,
    },
  });
  const nextRemaining = calculateRemainingAfterWeight(batch.remainingGram, grossWeight);
  await db.batch.update({ where: { id: batch.id }, data: { remainingGram: nextRemaining } });
  const limit = await getHandLimit(input.courierId, earnings);
  await db.financeProcessing.create({
    data: { dataEntryId: entry.id, courierId: input.courierId, batchId: batch.id, remainingGram: nextRemaining, earnings, maxHand: limit.maxHand },
  });
  await logAction({ userLogin: input.actorLogin, action: "Ввод данных", entity: "DataEntry", details: { entryId: entry.id, quantity: input.quantity, grossWeight, earnings }, newValue: entry });
  return entry;
}

export async function health() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    db: await db.$queryRaw`SELECT 1 as result`.then(() => "connected").catch(() => "disconnected"),
    env: env.VITE_NODE_ENV,
  };
}

export async function getAppState() {
  await ensureSeedData();
  await ensureDefaultCourierStatusRules();
  await ensureDefaultDisputeLogic();
  const [employees, cities, products, citySettings, priceRates, stashTypes, marketplaces, batches, dataEntries, issues, issueAllocations, monthlySettlements, settlementWriteOffs, penalties, financeProcessing, financeLedger, problemTypes, decisions, statusRules, settings, logs] = await Promise.all([
    db.employee.findMany({ orderBy: { createdAt: "asc" } }),
    db.city.findMany({ orderBy: { name: "asc" } }),
    db.product.findMany({ orderBy: { name: "asc" } }),
    db.cityProductSetting.findMany(),
    db.priceRate.findMany(),
    db.stashType.findMany(),
    db.marketplace.findMany({ orderBy: { name: "asc" } }),
    db.batch.findMany({ orderBy: { createdAt: "desc" } }),
    db.dataEntry.findMany({ orderBy: { createdAt: "desc" } }),
    db.issueRecord.findMany({ orderBy: { createdAt: "desc" } }),
    db.dataEntryIssueAllocation.findMany({ orderBy: { createdAt: "desc" } }),
    db.monthlySettlement.findMany({ orderBy: { createdAt: "desc" } }),
    db.settlementDisputeWriteOff.findMany({ orderBy: { createdAt: "desc" } }),
    db.penalty.findMany({ orderBy: { createdAt: "desc" } }),
    db.financeProcessing.findMany({ orderBy: { createdAt: "desc" } }),
    db.financeLedger.findMany({ orderBy: { createdAt: "desc" } }),
    db.problemType.findMany({ orderBy: { name: "asc" } }),
    db.disputeDecision.findMany({ orderBy: { name: "asc" } }),
    db.courierStatusRule.findMany({ orderBy: { minPercent: "asc" } }),
    db.appSetting.findMany(),
    db.appLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const courierStats = await Promise.all(employees.filter((employee) => employee.role === "COURIER").map(async (employee) => ({ courierId: employee.id, ...(await getCourierStats(employee.id)) })));
  return { employees, cities, products, citySettings, priceRates, stashTypes, marketplaces, batches, dataEntries, issues, issueAllocations, monthlySettlements, settlementWriteOffs, penalties, financeProcessing, financeLedger, problemTypes, decisions, statusRules, settings, logs, courierStats };
}

export async function getDashboardAnalytics(input: { actorLogin: string; from?: string; to?: string; groupBy?: DashboardGroupBy; marketplace?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  await ensureSeedData();
  await ensureDefaultCourierStatusRules();
  await ensureDefaultDisputeLogic();
  const { start, end } = dateRangeFromInput(input.from, input.to);
  const groupBy = input.groupBy ?? "day";
  const selectedMarketplace = input.marketplace && input.marketplace !== "ALL" ? input.marketplace : undefined;

  const [employees, marketplaces, entries, issues, batches, penalties, ledger, problemTypes, decisions] = await Promise.all([
    db.employee.findMany({ orderBy: { login: "asc" } }),
    db.marketplace.findMany({ orderBy: { name: "asc" } }),
    db.dataEntry.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } }),
    db.issueRecord.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } }),
    db.batch.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } }),
    db.penalty.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } }),
    db.financeLedger.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } }),
    db.problemType.findMany(),
    db.disputeDecision.findMany(),
  ]);

  const marketplaceNames = [...new Set([...marketplaces.map((mp) => mp.name), ...entries.flatMap((entry) => Object.keys(parseDistribution(entry.mpDistribution))), ...issues.map((issue) => issue.marketplace).filter((name): name is string => Boolean(name))])];
  const filteredIssues = selectedMarketplace ? issues.filter((issue) => issue.marketplace === selectedMarketplace) : issues;
  const filteredEntries = selectedMarketplace ? entries.filter((entry) => Number(parseDistribution(entry.mpDistribution)[selectedMarketplace] ?? 0) > 0) : entries;

  const marketplaceRows = marketplaceNames.map((name) => {
    let addresses = 0;
    let grams = 0;
    let earnings = 0;
    for (const entry of entries) {
      const count = Number(parseDistribution(entry.mpDistribution)[name] ?? 0);
      if (count <= 0) continue;
      const share = entry.quantity > 0 ? count / entry.quantity : 0;
      addresses += count;
      grams += entry.weightPerAddr * count;
      earnings += entry.earnings * share;
    }
    const mpIssues = issues.filter((issue) => issue.marketplace === name);
    const disputes = mpIssues.filter((issue) => issue.kind === "DISPUTE").length;
    const openDisputes = mpIssues.filter((issue) => issue.kind === "DISPUTE" && issue.status === "OPEN").length;
    const tickets = mpIssues.filter((issue) => issue.kind === "TICKET").length;
    const writeOff = mpIssues.reduce((sum, issue) => sum + issue.writeOff, 0);
    return { name, status: marketplaces.find((mp) => mp.name === name)?.status ?? "HISTORY", addresses, grams, earnings, disputes, openDisputes, closedDisputes: disputes - openDisputes, tickets, writeOff, disputePercent: addresses > 0 ? (disputes / addresses) * 100 : 0 };
  }).sort((a, b) => b.addresses - a.addresses);

  const timelineMap = new Map<string, { key: string; addresses: number; grams: number; earnings: number; disputes: number; tickets: number; writeOff: number }>();
  const getBucket = (date: Date) => {
    const key = groupDateKey(date, groupBy);
    if (!timelineMap.has(key)) timelineMap.set(key, { key, addresses: 0, grams: 0, earnings: 0, disputes: 0, tickets: 0, writeOff: 0 });
    return timelineMap.get(key)!;
  };
  for (const entry of filteredEntries) {
    const bucket = getBucket(entry.createdAt);
    if (selectedMarketplace) {
      const count = Number(parseDistribution(entry.mpDistribution)[selectedMarketplace] ?? 0);
      const share = entry.quantity > 0 ? count / entry.quantity : 0;
      bucket.addresses += count;
      bucket.grams += entry.weightPerAddr * count;
      bucket.earnings += entry.earnings * share;
    } else {
      bucket.addresses += entry.quantity;
      bucket.grams += entry.grossWeight;
      bucket.earnings += entry.earnings;
    }
  }
  for (const issue of filteredIssues) {
    const bucket = getBucket(issue.createdAt);
    if (issue.kind === "DISPUTE") bucket.disputes += 1;
    if (issue.kind === "TICKET") bucket.tickets += 1;
    bucket.writeOff += issue.writeOff;
  }

  const courierRows = await Promise.all(employees.filter((employee) => employee.role === "COURIER").map(async (employee) => {
    const courierEntries = entries.filter((entry) => entry.courierId === employee.id);
    const courierIssues = issues.filter((issue) => issue.courierId === employee.id);
    const stats = await getCourierStatsForRange(employee.id, start, end);
    const writeOff = courierIssues.reduce((sum, issue) => sum + issue.writeOff, 0) + penalties.filter((penalty) => penalty.courierId === employee.id).reduce((sum, penalty) => sum + penalty.amount, 0);
    return { courierId: employee.id, login: employee.login, status: employee.status, addresses: stats.addresses, disputes: stats.disputes, disputePercent: stats.disputePercent, statusName: stats.statusName, earnings: courierEntries.reduce((sum, entry) => sum + entry.earnings, 0), writeOff, bankBalance: employee.bankBalance, depositBalance: employee.depositBalance };
  }));

  const ledgerByType = ledger.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + item.amount;
    return acc;
  }, {});
  const problemRows = problemTypes.map((problem) => ({ name: problem.name, count: filteredIssues.filter((issue) => safeParseJson<string[]>(issue.problemIds, []).includes(problem.id)).length })).filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  const decisionRows = decisions.map((decision) => ({ name: decision.name, count: filteredIssues.filter((issue) => issue.decisionId === decision.id).length, writeOff: filteredIssues.filter((issue) => issue.decisionId === decision.id).reduce((sum, issue) => sum + issue.writeOff, 0) })).filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  const manualDisputes = filteredIssues.filter((issue) => issue.kind === "DISPUTE" && safeParseJson<{ manualMode?: boolean }>(issue.calculationData, {}).manualMode).length;
  const autoDisputes = filteredIssues.filter((issue) => issue.kind === "DISPUTE" && issue.status === "CLOSED").length - manualDisputes;

  const addresses = filteredEntries.reduce((sum, entry) => {
    if (!selectedMarketplace) return sum + entry.quantity;
    return sum + Number(parseDistribution(entry.mpDistribution)[selectedMarketplace] ?? 0);
  }, 0);
  const grams = filteredEntries.reduce((sum, entry) => {
    if (!selectedMarketplace) return sum + entry.grossWeight;
    return sum + entry.weightPerAddr * Number(parseDistribution(entry.mpDistribution)[selectedMarketplace] ?? 0);
  }, 0);
  const earnings = filteredEntries.reduce((sum, entry) => {
    if (!selectedMarketplace) return sum + entry.earnings;
    const count = Number(parseDistribution(entry.mpDistribution)[selectedMarketplace] ?? 0);
    return sum + entry.earnings * (entry.quantity > 0 ? count / entry.quantity : 0);
  }, 0);
  const disputes = filteredIssues.filter((issue) => issue.kind === "DISPUTE");
  const tickets = filteredIssues.filter((issue) => issue.kind === "TICKET");
  const writeOff = filteredIssues.reduce((sum, issue) => sum + issue.writeOff, 0) + penalties.reduce((sum, penalty) => sum + penalty.amount, 0);
  const balances = employees.filter((employee) => employee.role === "COURIER").reduce((acc, employee) => ({ hand: acc.hand + employee.handBalance, deposit: acc.deposit + employee.depositBalance, bank: acc.bank + employee.bankBalance }), { hand: 0, deposit: 0, bank: 0 });

  return {
    period: { from: input.from, to: input.to, groupBy, marketplace: selectedMarketplace ?? "ALL" },
    summary: { addresses, grams, earnings, entries: filteredEntries.length, batches: batches.length, activeCouriers: courierRows.filter((row) => row.addresses > 0).length, marketplaces: marketplaceRows.length, disputes: disputes.length, openDisputes: disputes.filter((issue) => issue.status === "OPEN").length, closedDisputes: disputes.filter((issue) => issue.status === "CLOSED").length, tickets: tickets.length, openTickets: tickets.filter((issue) => issue.status === "OPEN").length, writeOff, disputePercent: addresses > 0 ? (disputes.length / addresses) * 100 : 0 },
    marketplaceRows,
    timeline: [...timelineMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    courierRows: courierRows.sort((a, b) => b.addresses - a.addresses),
    finance: { ledgerByType, income: Object.values(ledgerByType).filter((value) => value > 0).reduce((sum, value) => sum + value, 0), expense: Object.values(ledgerByType).filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0), penalties: penalties.reduce((sum, penalty) => sum + penalty.amount, 0), balances },
    disputes: { problemRows, decisionRows, manualDisputes, autoDisputes: Math.max(0, autoDisputes), writeOff: disputes.reduce((sum, issue) => sum + issue.writeOff, 0) },
    dataQuality: { zeroMpEntries: entries.filter((entry) => Object.values(parseDistribution(entry.mpDistribution)).reduce((sum, value) => sum + Number(value || 0), 0) === 0).length, unprocessedFinanceRows: await db.financeProcessing.count({ where: { status: "PENDING" } }) },
  };
}

export async function loginEmployee(input: { login: string; password: string }) {
  await ensureSeedData();
  const employee = await db.employee.findUnique({ where: { login: input.login } });
  if (!employee || employee.password !== input.password || employee.status !== "ACTIVE") {
    await logAction({ userLogin: input.login, action: "Неудачный вход", entity: "Employee", details: { login: input.login } });
    throw new Error("Неверный логин/пароль или сотрудник неактивен");
  }
  await logAction({ userId: employee.id, userLogin: employee.login, action: "Вход", entity: "Employee", details: { role: employee.role } });
  return employee;
}

export async function createCity(input: { actorLogin: string; name: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const city = await db.city.create({ data: { name: input.name, status: "ACTIVE" } });
  await seedCityDefaults(city.id);
  await logAction({ userLogin: input.actorLogin, action: "Создание города", entity: "City", details: city, newValue: city });
  return city;
}

export async function createEmployee(input: { actorLogin: string; login: string; password: string; role: Role }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const employee = await db.employee.create({ data: { login: input.login, password: input.password, role: input.role, status: "ACTIVE" } });
  await logAction({ userLogin: input.actorLogin, action: "Создание сотрудника", entity: "Employee", details: { login: employee.login, role: employee.role }, newValue: employee });
  return employee;
}

export async function updateEmployee(input: { actorLogin: string; id: string; password?: string; role?: Role; status?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.employee.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Сотрудник не найден");
  const employee = await db.employee.update({ where: { id: input.id }, data: { password: input.password || oldValue.password, role: input.role || oldValue.role, status: input.status || oldValue.status } });
  await logAction({ userLogin: input.actorLogin, action: "Изменение сотрудника/прав", entity: "Employee", details: { id: input.id }, oldValue, newValue: employee });
  return employee;
}

export async function createBatch(input: { actorLogin: string; name: string; cityId: string; productId: string; weight: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  assertPositive(input.weight, "Вес партии");
  const batch = await db.batch.create({ data: { name: input.name, cityId: input.cityId, productId: input.productId, weight: input.weight, remainingGram: input.weight, status: "NEW" } });
  await logAction({ userLogin: input.actorLogin, action: "Создание партии", entity: "Batch", details: batch, newValue: batch });
  return batch;
}

export async function issueBatch(input: { actorLogin: string; batchId: string; courierId: string; totalBatchCost: number; warehouseWorkCost?: number; fasEnabled?: boolean; fasCost?: number; fasPackages?: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  const oldValue = await db.batch.findUnique({ where: { id: input.batchId } });
  if (!oldValue || oldValue.status !== "NEW" || oldValue.courierId) throw new Error("Партия недоступна для выдачи");
  const courier = await db.employee.findUnique({ where: { id: input.courierId } });
  if (!courier || courier.role !== "COURIER" || courier.status !== "ACTIVE") throw new Error("Можно выдать только активному курьеру");
  const totalBatchCost = Number(input.totalBatchCost);
  const fasCost = Number(input.fasCost ?? 0);
  const warehouseWorkCost = Number(input.warehouseWorkCost ?? 0);
  const fasPackages = Math.trunc(Number(input.fasPackages ?? 0));
  assertNonNegative(fasCost, "Стоимость ФАС");
  assertNonNegative(warehouseWorkCost, "Оплата работы склада");
  assertNonNegative(fasPackages, "Количество ФАС");
  const costPerGram = calculateRealCostPerGram({ totalBatchCost, weight: oldValue.weight, fasEnabled: input.fasEnabled ?? false, fasCost, warehouseWorkCost });
  const batch = await db.batch.update({
    where: { id: input.batchId },
    data: { courierId: input.courierId, status: "ISSUED", issuedAt: new Date(), totalBatchCost, warehouseWorkCost, costPerGram, fasEnabled: input.fasEnabled ?? false, fasCost, fasPackages },
  });
  await logAction({ userLogin: input.actorLogin, action: "Выдача партии", entity: "Batch", details: { batchId: input.batchId, courierId: input.courierId, totalBatchCost, warehouseWorkCost, costPerGram, fasEnabled: input.fasEnabled ?? false, fasCost, fasPackages }, oldValue, newValue: batch });
  return batch;
}

export async function closeBatch(input: { actorLogin: string; batchId: string; retailCloseSum?: number; reason?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  const batch = await db.batch.findUnique({ where: { id: input.batchId } });
  if (!batch) throw new Error("Партия не найдена");
  if (batch.status === "CLOSED") throw new Error("Партия уже закрыта");
  let deduction = 0;
  let closeReason = input.reason ?? "Закрыта";
  if (batch.courierId && batch.remainingGram > 0) {
    const lossPercent = (batch.remainingGram / batch.weight) * 100;
    if (lossPercent <= 10) {
      deduction = batch.remainingGram * batch.costPerGram;
      closeReason = `Потеря ${lossPercent.toFixed(2)}%, списание по реальной себестоимости`;
    } else {
      deduction = input.retailCloseSum ?? 0;
      if (deduction <= 0) throw new Error("При потере больше 10% обязательна розничная стоимость");
      closeReason = `Потеря ${lossPercent.toFixed(2)}%, списание по рознице`;
    }
    if (deduction > 0) await applyMoneyWriteOff(batch.courierId, deduction, `Закрытие партии ${batch.name}`);
  }
  const updated = await db.batch.update({ where: { id: batch.id }, data: { status: "CLOSED", closedAt: new Date(), closeReason, retailCloseSum: input.retailCloseSum ?? null } });
  await logAction({ userLogin: input.actorLogin, action: "Закрытие партии", entity: "Batch", details: { batchId: batch.id, deduction, closeReason }, oldValue: batch, newValue: updated });
  return updated;
}

async function applyMoneyWriteOff(employeeId: string, amount: number, note: string) {
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error("Сотрудник не найден");
  const bankWrittenOff = Math.min(employee.bankBalance, amount);
  const depositWrittenOff = Math.max(0, amount - bankWrittenOff);
  await db.employee.update({ where: { id: employeeId }, data: { bankBalance: employee.bankBalance - bankWrittenOff, depositBalance: employee.depositBalance - depositWrittenOff } });
  await db.financeLedger.create({ data: { employeeId, type: "WRITE_OFF", amount: -amount, note } });
  return { bankWrittenOff, depositWrittenOff };
}

export async function createDataEntry(input: { actorLogin: string; courierId: string; batchId: string; cityId: string; mode: Mode; weightPerAddr: number; stashTypeName: string; quantity: number; mpDistribution: MarketplaceDistribution }) {
  return createDataEntryInternal(input);
}

export async function editDataEntry(input: { actorLogin: string; id: string; courierId: string; batchId: string; cityId: string; mode: Mode; weightPerAddr: number; stashTypeName: string; quantity: number; mpDistribution: MarketplaceDistribution }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  const oldValue = await db.dataEntry.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Ввод данных не найден");
  const oldBatch = await db.batch.findUnique({ where: { id: oldValue.batchId } });
  const newBatch = await db.batch.findUnique({ where: { id: input.batchId } });
  if (!oldBatch || !newBatch) throw new Error("Партия не найдена");
  if (newBatch.status !== "ISSUED") throw new Error("Ввод данных доступен только по выданной партии");
  if (newBatch.courierId !== input.courierId) throw new Error("Партия закреплена за другим курьером");
  assertPositive(input.weightPerAddr, "Вес одного адреса");
  assertPositive(input.quantity, "Количество адресов");

  const totalMp = Object.values(input.mpDistribution).reduce((sum, value) => sum + Number(value || 0), 0);
  if (totalMp !== input.quantity) throw new Error("Все адреса должны быть распределены по МП");

  const restoredRemaining = oldBatch.id === newBatch.id ? normalizeWeight(oldBatch.remainingGram + oldValue.grossWeight) : newBatch.remainingGram;
  const grossWeight = normalizeWeight(input.weightPerAddr * input.quantity);
  assertWeightWithinRemaining(grossWeight, restoredRemaining);

  const rate = await db.priceRate.findUnique({
    where: { cityId_productId_mode_weight: { cityId: input.cityId, productId: newBatch.productId, mode: input.mode, weight: input.weightPerAddr } },
  });
  if (!rate) throw new Error("Для этой весовки нет цены");
  const stashType = await db.stashType.findFirst({ where: { cityId: input.cityId, productId: newBatch.productId, mode: input.mode, name: input.stashTypeName } });
  const earnings = (rate.price + (stashType?.surcharge ?? 0)) * input.quantity;

  if (oldBatch.id !== newBatch.id) {
    await db.batch.update({ where: { id: oldBatch.id }, data: { remainingGram: normalizeWeight(oldBatch.remainingGram + oldValue.grossWeight) } });
    await db.batch.update({ where: { id: newBatch.id }, data: { remainingGram: calculateRemainingAfterWeight(newBatch.remainingGram, grossWeight) } });
  } else {
    await db.batch.update({ where: { id: newBatch.id }, data: { remainingGram: calculateRemainingAfterWeight(restoredRemaining, grossWeight) } });
  }

  const updated = await db.dataEntry.update({
    where: { id: input.id },
    data: {
      courierId: input.courierId,
      batchId: input.batchId,
      cityId: input.cityId,
      productId: newBatch.productId,
      mode: input.mode,
      weightPerAddr: input.weightPerAddr,
      stashTypeName: input.stashTypeName,
      quantity: input.quantity,
      mpDistribution: json(input.mpDistribution),
      grossWeight,
      earnings,
    },
  });
  const processing = await db.financeProcessing.findUnique({ where: { dataEntryId: input.id } });
  if (processing) {
    const limit = await getHandLimit(input.courierId, earnings);
    if (processing.status === "DONE") {
      const processedEmployee = await db.employee.findUnique({ where: { id: processing.courierId } });
      if (processedEmployee) {
        await db.employee.update({
          where: { id: processedEmployee.id },
          data: {
            handBalance: processedEmployee.handBalance - processing.handAmount,
            depositBalance: processedEmployee.depositBalance - processing.depositAmount,
            bankBalance: processedEmployee.bankBalance - processing.bankAmount,
          },
        });
        await db.financeLedger.create({ data: { employeeId: processedEmployee.id, type: "REVERSAL", amount: -processing.handAmount - processing.depositAmount - processing.bankAmount, note: `Откат расчёта перед редактированием ввода ${input.id}` } });
      }
    }
    await db.financeProcessing.update({ where: { id: processing.id }, data: { courierId: input.courierId, batchId: input.batchId, remainingGram: calculateRemainingAfterWeight(restoredRemaining, grossWeight), earnings, maxHand: limit.maxHand, handAmount: 0, depositAmount: 0, bankAmount: 0, status: "PENDING", processedAt: null } });
    await db.dataEntry.update({ where: { id: input.id }, data: { processed: false } });
  }
  await logAction({ userLogin: input.actorLogin, action: "Редактирование ввода", entity: "DataEntry", details: { id: input.id, earnings }, oldValue, newValue: updated });
  return updated;
}

export async function calculateFinance(input: { actorLogin: string; processingId: string; handAmount: number; depositAmount: number; bankAmount: number; disableLimit?: boolean }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  const item = await db.financeProcessing.findUnique({ where: { id: input.processingId } });
  if (!item || item.status !== "PENDING") throw new Error("Строка не найдена или уже обработана");
  assertNonNegative(input.handAmount, "На руки");
  assertNonNegative(input.depositAmount, "Залог");
  assertNonNegative(input.bankAmount, "Банк");
  const limit = await getHandLimit(item.courierId, item.earnings);
  if (!input.disableLimit && input.handAmount > limit.maxHand + 0.01) throw new Error(`На руки нельзя больше лимита ${limit.maxHand}`);
  const handAmount = input.handAmount;
  const total = handAmount + input.depositAmount + input.bankAmount;
  assertMoneyEquals(total, item.earnings, "Распределение на руки + залог + банк");
  const employee = await db.employee.findUnique({ where: { id: item.courierId } });
  if (!employee) throw new Error("Курьер не найден");
  const updated = await db.$transaction(async (tx) => {
    const claimed = await tx.financeProcessing.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "DONE", handAmount, depositAmount: input.depositAmount, bankAmount: input.bankAmount, maxHand: limit.maxHand, processedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("Строка уже обработана");
    await tx.employee.update({
      where: { id: employee.id },
      data: {
        handBalance: { increment: handAmount },
        depositBalance: { increment: input.depositAmount },
        bankBalance: { increment: input.bankAmount },
      },
    });
    for (const [type, amount] of [["HAND", handAmount], ["DEPOSIT", input.depositAmount], ["BANK", input.bankAmount]] as const) {
      if (amount !== 0) await tx.financeLedger.create({ data: { employeeId: employee.id, type, amount, note: `Распределение заработка по вводу ${item.dataEntryId}` } });
    }
    await tx.dataEntry.update({ where: { id: item.dataEntryId }, data: { processed: true } });
    return tx.financeProcessing.findUniqueOrThrow({ where: { id: item.id } });
  });
  await logAction({ userLogin: input.actorLogin, action: "Выплата/расчёт", entity: "FinanceProcessing", details: { processingId: item.id, limit, handAmount, depositAmount: input.depositAmount, bankAmount: input.bankAmount }, oldValue: item, newValue: updated });
  return updated;
}

export async function openIssue(input: { actorLogin: string; kind: IssueKind; orderNumber?: string; courierId: string; batchId: string; cityId: string; productId: string; weight: number; marketplace: string; stashType: string; retailPrice: number; problemIds: string[]; otherText?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
  assertPositive(input.weight, "Вес");
  assertNonNegative(input.retailPrice, "Розничная цена");
  if (!input.batchId) throw new Error("Выберите партию для расчёта себестоимости.");
  if (!input.problemIds.length) throw new Error("Выберите тип проблемы");
  if ((input.orderNumber?.length ?? 0) > 120) throw new Error("Номер заказа слишком длинный");
  const courier = await db.employee.findUnique({ where: { id: input.courierId } });
  if (!courier || courier.role !== "COURIER" || courier.status !== "ACTIVE") throw new Error("Курьер не найден или неактивен");
  const batch = await db.batch.findUnique({ where: { id: input.batchId } });
  if (!batch || batch.status !== "ISSUED" || batch.courierId !== input.courierId) throw new Error("Выберите выданную партию этого курьера");
  if (batch.productId !== input.productId) throw new Error("Товар должен совпадать с товаром выбранной партии");
  const allocation = await findFreeDataEntryForIssue({ courierId: input.courierId, batchId: input.batchId, cityId: input.cityId, productId: input.productId, weight: input.weight, stashType: input.stashType, marketplace: input.marketplace });
  if (!allocation) throw new Error("Не найден свободный адрес по выбранной партии и указанным параметрам.");
  const orderNumber = input.orderNumber?.trim() || null;
  const issue = await db.$transaction(async (tx) => {
    const created = await tx.issueRecord.create({ data: { kind: input.kind, orderNumber, courierId: input.courierId, dataEntryId: allocation.entry.id, batchId: input.batchId, weight: input.weight, marketplace: input.marketplace, stashType: input.stashType, retailPrice: input.retailPrice, problemIds: json(input.problemIds), otherText: input.otherText, status: "OPEN" } });
    await tx.dataEntryIssueAllocation.create({ data: { dataEntryId: allocation.entry.id, issueRecordId: created.id, courierId: input.courierId, cityId: input.cityId, productId: input.productId, batchId: input.batchId, marketplace: input.marketplace, stashType: input.stashType, weight: input.weight } });
    return created;
  });
  await logAction({ userLogin: input.actorLogin, action: input.kind === "TICKET" ? "Открытие тикета" : "Открытие диспута", entity: "IssueRecord", details: { issue, autoMatchedDataEntryId: allocation.entry.id, batchId: input.batchId, freeBefore: allocation.free, freeAfter: allocation.free - 1, search: { courierId: input.courierId, cityId: input.cityId, productId: input.productId, weight: input.weight, stashType: input.stashType, marketplace: input.marketplace } }, newValue: issue });
  return issue;
}

export async function closeTicket(input: { actorLogin: string; issueId: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
  const oldValue = await db.issueRecord.findUnique({ where: { id: input.issueId } });
  if (!oldValue || oldValue.kind !== "TICKET") throw new Error("Тикет не найден");
  const issue = await db.issueRecord.update({ where: { id: input.issueId }, data: { status: "CLOSED", closedAt: new Date() } });
  await logAction({ userLogin: input.actorLogin, action: "Закрытие тикета", entity: "IssueRecord", details: { issueId: input.issueId }, oldValue, newValue: issue });
  return issue;
}

function normalizeDisputeLogic(value: string | null | undefined): DisputeLogic {
  return DISPUTE_LOGIC_VALUES.has(value as DisputeLogic) ? (value as DisputeLogic) : "NONE";
}

function getDecisionKind(decision: { name: string; calcType: string }): DisputeDecisionKind {
  const name = decision.name.toLowerCase();
  if (name.includes("купон") || decision.calcType === "PERCENT") return "COUPON";
  if (name.includes("возврат") || decision.calcType === "COST" || decision.calcType === "RETAIL") return "RETURN";
  return "MANUAL";
}

function calculateWriteOffByConfig(input: { config: DisputeRuleConfig; retailPrice: number; stashCost: number; courierWork: number; damage: number }) {
  if (input.config.none || input.config.manual) return 0;
  let total = 0;
  if (input.config.cost) total += input.stashCost;
  if (input.config.work) total += input.courierWork;
  if (input.config.retail) total += input.retailPrice;
  if (input.config.retailPercentEnabled) total += (input.retailPrice * Number(input.config.retailPercent || 0)) / 100;
  if (input.config.damagePercentEnabled) total += (input.damage * Number(input.config.damagePercent || 0)) / 100;
  if (input.config.fullDamage) total += input.damage;
  return total;
}

async function calculateDisputeWriteOff(issue: NonNullable<Awaited<ReturnType<typeof db.issueRecord.findUnique>>>, decision: { name: string; calcType: string; percent?: number }, couponPercentInput?: number, override?: { status: Awaited<ReturnType<typeof getCourierStatusByPercent>>; stats: { addresses: number; disputes: number; disputePercent: number; statusName: string } }) {
  const decisionKind = getDecisionKind(decision);
  const currentStats = override ? null : await getCourierStats(issue.courierId);
  const stats = override?.stats ?? currentStats!;
  const status = override?.status ?? currentStats!.status;
  const entry = issue.dataEntryId ? await db.dataEntry.findUnique({ where: { id: issue.dataEntryId } }) : null;
  const batchId = issue.batchId ?? entry?.batchId;
  const batch = batchId ? await db.batch.findUnique({ where: { id: batchId } }) : null;
  const cityId = entry?.cityId ?? batch?.cityId;
  const productId = entry?.productId ?? batch?.productId;
  const stashTypeName = issue.stashType || entry?.stashTypeName || "";
  const rate = cityId && productId
    ? await db.priceRate.findUnique({ where: { cityId_productId_mode_weight: { cityId, productId, mode: "RETAIL", weight: issue.weight } } })
    : null;
  const stashType = cityId && productId && stashTypeName
    ? await db.stashType.findFirst({ where: { cityId, productId, mode: "RETAIL", name: stashTypeName } })
    : null;
  const baseCost = (batch?.costPerGram ?? 0) * issue.weight;
  const fasCost = 0;
  const stashCost = baseCost;
  const workBase = rate?.price ?? 0;
  const workSurcharge = stashType?.surcharge ?? 0;
  const courierWork = workBase + workSurcharge;
  const couponPercent = decisionKind === "COUPON" ? Number(couponPercentInput ?? decision.percent ?? 50) : undefined;
  const validatedCouponPercent = couponPercent ?? 0;
  if (decisionKind === "COUPON" && (!Number.isFinite(validatedCouponPercent) || validatedCouponPercent < 1 || validatedCouponPercent > 100)) {
    throw new Error("Процент купона должен быть от 1 до 100");
  }
  const damage = decisionKind === "COUPON" ? (issue.retailPrice * validatedCouponPercent) / 100 : issue.retailPrice;
  const defaultLogic = getDefaultDisputeLogic({ minPercent: status?.minPercent ?? stats.disputePercent, maxPercent: status?.maxPercent ?? null });
  const returnConfig = normalizeRuleConfig(safeParseJson<DisputeRuleConfig>(status?.returnRules, legacyLogicToRuleConfig(status?.returnLogic, status?.returnPercent ?? 0)), defaultLogic.returnRules);
  const couponConfig = normalizeRuleConfig(safeParseJson<DisputeRuleConfig>(status?.couponRules, legacyLogicToRuleConfig(status?.couponLogic, status?.couponPercent ?? 0)), defaultLogic.couponRules);
  const activeConfig = decisionKind === "COUPON" ? couponConfig : decisionKind === "RETURN" ? returnConfig : { manual: true };
  const manualMode = Boolean(status?.manualMode) || Boolean(activeConfig.manual) || decisionKind === "MANUAL";
  const writeOff = manualMode ? 0 : calculateWriteOffByConfig({ config: activeConfig, retailPrice: issue.retailPrice, stashCost, courierWork, damage });
  const referenceAmount = manualMode ? damage : writeOff;
  const calculation = {
    source: {
      issue: { issueId: issue.id, orderNumber: issue.orderNumber, weight: issue.weight, stashType: issue.stashType, retailPrice: issue.retailPrice, marketplace: issue.marketplace, problemIds: issue.problemIds },
      courierStats: { addresses: stats.addresses, disputes: stats.disputes, disputePercent: stats.disputePercent, statusName: stats.statusName, statusRuleId: status?.id },
      batch: batch ? { batchId: batch.id, totalBatchCost: batch.totalBatchCost, warehouseWorkCost: batch.warehouseWorkCost, costPerGram: batch.costPerGram, fasEnabled: batch.fasEnabled, fasCost: batch.fasCost, fasPackages: batch.fasPackages, fasCostPerAddress: fasCost } : null,
      city: { cityId, productId, mode: "RETAIL", priceRateId: rate?.id, stashTypeId: stashType?.id },
      settings: { returnRules: returnConfig, couponRules: couponConfig, manualMode: status?.manualMode, workBlocked: status?.workBlocked },
    },
    decisionKind,
    configuredRules: activeConfig,
    couponPercent: couponPercent ?? null,
    baseCost,
    fasCost,
    stashCost,
    workBase,
    workSurcharge,
    courierWork,
    damage,
    manualMode,
    referenceAmount,
    writeOff,
  };
  return { decisionKind, couponPercent, stats, status, calculation, writeOff };
}

export async function closeDispute(input: { actorLogin: string; issueId: string; decisionId: string; couponPercent?: number; manualAmount?: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
  await ensureDefaultDisputeLogic();
  const oldValue = await db.issueRecord.findUnique({ where: { id: input.issueId } });
  if (!oldValue || oldValue.kind !== "DISPUTE") throw new Error("Диспут не найден");
  if (oldValue.status !== "OPEN") throw new Error("Диспут уже закрыт");
  const decision = await db.disputeDecision.findUnique({ where: { id: input.decisionId } });
  if (!decision) throw new Error("Решение не найдено");
  const calculationResult = await calculateDisputeWriteOff(oldValue, decision, input.couponPercent);
  const issue = await db.issueRecord.update({ where: { id: input.issueId }, data: { status: "CLOSED", closedAt: new Date(), decisionId: decision.id, calcType: calculationResult.decisionKind, couponPercent: calculationResult.couponPercent, calculationData: json({ ...calculationResult.calculation, awaitingFinalSettlement: true }), writeOff: 0 } });
  const statsAfterClose = await getCourierStats(oldValue.courierId);
  await logAction({
    userLogin: input.actorLogin,
    action: "Закрытие диспута",
    entity: "IssueRecord",
    details: {
      actorLogin: input.actorLogin,
      courierId: oldValue.courierId,
      issueId: input.issueId,
      decision: decision.name,
      couponPercent: calculationResult.couponPercent,
      courierStatusAtClose: calculationResult.stats.statusName,
      writeOff: 0,
      calculation: calculationResult.calculation,
      note: "Финальное списание будет рассчитано при выплате банка после ввода количества продаж.",
      recalculatedStats: { addresses: statsAfterClose.addresses, disputes: statsAfterClose.disputes, disputePercent: statsAfterClose.disputePercent, statusName: statsAfterClose.statusName },
    },
    oldValue,
    newValue: issue,
  });
  return issue;
}

export async function applyPenalty(input: { actorLogin: string; courierId: string; issueId?: string; amount: number; applyCourierStatus: boolean; stashDeduction: boolean; reason: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  assertPositive(input.amount, "Сумма штрафа");
  if (!input.reason.trim()) throw new Error("Причина штрафа обязательна");
  const writeOff = await applyMoneyWriteOff(input.courierId, input.amount, `Штраф: ${input.reason}`);
  const penalty = await db.penalty.create({ data: { courierId: input.courierId, issueId: input.issueId, amount: input.amount, applyCourierStatus: input.applyCourierStatus, stashDeduction: input.stashDeduction, reason: input.reason, ...writeOff } });
  await logAction({ userLogin: input.actorLogin, action: "Штраф", entity: "Penalty", details: penalty, newValue: penalty });
  return penalty;
}

async function buildBankPayoutPreview(input: { employeeId: string; amount: number; applyBonus: boolean; soldQuantity: number; periodFrom?: string; periodTo?: string }) {
  assertPositive(input.soldQuantity, "Количество продаж");
  const { start, end } = dateRangeFromInput(input.periodFrom, input.periodTo);
  validatePeriod(start, end);
  const employee = await db.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.role !== "COURIER" || employee.status !== "ACTIVE") throw new Error("Курьер не найден или неактивен");
  const [entries, periodIssues, setting] = await Promise.all([
    db.dataEntry.findMany({ where: { courierId: input.employeeId, createdAt: { gte: start, lte: end } } }),
    db.issueRecord.findMany({ where: { courierId: input.employeeId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } }),
    db.appSetting.findUnique({ where: { key: "bonusRules" } }),
  ]);
  const uploadedQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const ticketCount = periodIssues.filter((issue) => issue.kind === "TICKET").length;
  const periodDisputes = periodIssues.filter((issue) => issue.kind === "DISPUTE");
  const disputeCount = periodDisputes.length;
  const openDisputeCount = periodDisputes.filter((issue) => issue.status === "OPEN").length;
  const disputePercent = (disputeCount / input.soldQuantity) * 100;
  const openDisputePercent = (openDisputeCount / input.soldQuantity) * 100;
  if (openDisputePercent > 10) throw new Error("Выплата банка заблокирована: процент открытых диспутов превышает допустимый лимит 10%.");
  const status = await getCourierStatusByPercent(disputePercent);
  const statusName = status?.name ?? "Без статуса";
  const closedDisputes = await db.issueRecord.findMany({ where: { courierId: input.employeeId, kind: "DISPUTE", status: "CLOSED", closedAt: { gte: start, lte: end } }, orderBy: { closedAt: "asc" } });
  const existingWriteOffs = closedDisputes.length ? await db.settlementDisputeWriteOff.findMany({ where: { issueRecordId: { in: closedDisputes.map((issue) => issue.id) } } }) : [];
  const settledIssueIds = new Set(existingWriteOffs.map((item) => item.issueRecordId));
  const unsettledClosedDisputes = closedDisputes.filter((issue) => !settledIssueIds.has(issue.id));
  const settlementStats = { addresses: input.soldQuantity, disputes: disputeCount, disputePercent, statusName };
  const disputeWriteOffs = [] as Array<{ issueId: string; orderNumber: string | null; decisionId: string | null; retailPrice: number; couponPercent: number | null; writeOff: number; calculationData: string }>;
  for (const issue of unsettledClosedDisputes) {
    if (!issue.decisionId) throw new Error(`У закрытого диспута ${issue.orderNumber ?? issue.id} нет решения`);
    const decision = await db.disputeDecision.findUnique({ where: { id: issue.decisionId } });
    if (!decision) throw new Error("Решение закрытого диспута не найдено");
    const result = await calculateDisputeWriteOff(issue, decision, issue.couponPercent ?? undefined, { status, stats: settlementStats });
    disputeWriteOffs.push({ issueId: issue.id, orderNumber: issue.orderNumber, decisionId: issue.decisionId, retailPrice: issue.retailPrice, couponPercent: issue.couponPercent, writeOff: result.writeOff, calculationData: json({ ...result.calculation, finalSettlement: true }) });
  }
  const totalDisputeWriteOff = disputeWriteOffs.reduce((sum, row) => sum + row.writeOff, 0);
  const bankWrittenOff = Math.min(employee.bankBalance, totalDisputeWriteOff);
  const depositWrittenOff = Math.max(0, totalDisputeWriteOff - bankWrittenOff);
  const bankAfterWriteOff = employee.bankBalance - bankWrittenOff;
  const depositAfterWriteOff = employee.depositBalance - depositWrittenOff;

  const rules = setting ? (JSON.parse(setting.value) as BonusSettings) : {};
  const periodEarnings = entries.reduce((sum, entry) => sum + entry.earnings, 0);
  const entryCities = await db.city.findMany({ where: { id: { in: [...new Set(entries.map((entry) => entry.cityId))] } } });
  const isMskSpbOnly = entryCities.length > 0 && entryCities.every((city) => /москва|мск|санкт|спб|питер/i.test(city.name));
  const defaultDepositRequired = isMskSpbOnly ? (rules.depositMskSpb ?? 250000) : (rules.depositRegions ?? 350000);
  let bonusPercent = 0;
  const bonusChecks: Array<{ name: string; bonusPercent: number; applied: boolean; reason: string }> = [];
  if (input.applyBonus) {
    const configuredRules = Array.isArray(rules.rules) && rules.rules.length > 0 ? rules.rules : [
      { name: "+10% за продажи", enabled: true, bonusPercent: 10, minAddresses: rules.addressThreshold ?? 600, maxDisputePercent: 999, depositRequired: defaultDepositRequired, logic: "Порог продаж за период" },
      { name: "+5% за диспуты", enabled: true, bonusPercent: 5, minAddresses: 0, maxDisputePercent: 10, depositRequired: defaultDepositRequired, logic: "Диспуты не выше 10%" },
    ];
    for (const rule of configuredRules) {
      const ruleDeposit = rule.depositRequired ?? defaultDepositRequired;
      const addressOk = input.soldQuantity >= (rule.minAddresses ?? 0);
      const disputeOk = disputePercent <= (rule.maxDisputePercent ?? 999);
      const depositOk = depositAfterWriteOff >= ruleDeposit;
      const applied = rule.enabled !== false && addressOk && disputeOk && depositOk;
      if (applied) bonusPercent += rule.bonusPercent ?? 0;
      bonusChecks.push({ name: rule.name ?? "Бонус", bonusPercent: rule.bonusPercent ?? 0, applied, reason: `продажи ${input.soldQuantity}/${rule.minAddresses ?? 0}; диспуты ${disputePercent.toFixed(2)}% ≤ ${rule.maxDisputePercent ?? 999}%; залог ${depositAfterWriteOff}/${ruleDeposit}` });
    }
  }
  bonusPercent = Math.min(bonusPercent, rules.maxPercent ?? 15);
  const bonusAmount = input.applyBonus ? (periodEarnings * bonusPercent) / 100 : 0;
  const availableBankAfterBonus = bankAfterWriteOff + bonusAmount;
  if (input.amount > availableBankAfterBonus + 0.01) throw new Error("Сумма выплаты превышает доступный банк после списаний.");
  return { employee, period: { start, end }, soldQuantity: input.soldQuantity, uploadedQuantity, ticketCount, disputeCount, openDisputeCount, disputePercent, openDisputePercent, status, statusName, unsettledClosedDisputes: unsettledClosedDisputes.length, disputeWriteOffs, totalDisputeWriteOff, bankWrittenOff, depositWrittenOff, bankAfterWriteOff, depositAfterWriteOff, periodEarnings, bonusPercent, bonusAmount, bonusChecks, requestedBankPayout: input.amount, finalBankPayout: input.amount, finalBankBalance: availableBankAfterBonus - input.amount };
}

export async function previewBankPayout(input: { actorLogin: string; employeeId: string; amount: number; applyBonus: boolean; soldQuantity: number; periodFrom?: string; periodTo?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  const preview = await buildBankPayoutPreview(input);
  const safePreview = { ...preview, employee: undefined, status: undefined };
  return safePreview;
}

export async function payoutBank(input: { actorLogin: string; employeeId: string; amount: number; applyBonus: boolean; soldQuantity: number; periodFrom?: string; periodTo?: string }) {
  const actor = await requireActor(input.actorLogin, ["SUPER_ADMIN", "ADMIN"]);
  assertPositive(input.amount, "Сумма выплаты");
  const preview = await buildBankPayoutPreview(input);
  const settlement = await db.$transaction(async (tx) => {
    const createdSettlement = await tx.monthlySettlement.create({
      data: {
        courierId: input.employeeId,
        periodFrom: preview.period.start,
        periodTo: preview.period.end,
        soldQuantity: preview.soldQuantity,
        uploadedQuantity: preview.uploadedQuantity,
        disputeCount: preview.disputeCount,
        openDisputeCount: preview.openDisputeCount,
        ticketCount: preview.ticketCount,
        disputePercent: preview.disputePercent,
        openDisputePercent: preview.openDisputePercent,
        courierStatusName: preview.statusName,
        courierStatusRuleId: preview.status?.id,
        totalDisputeWriteOff: preview.totalDisputeWriteOff,
        bonusAmount: preview.bonusAmount,
        requestedBankPayout: input.amount,
        finalBankPayout: input.amount,
        createdBy: actor.login,
      },
    });
    await tx.employee.update({ where: { id: input.employeeId }, data: { bankBalance: preview.finalBankBalance, depositBalance: preview.depositAfterWriteOff } });
    if (preview.totalDisputeWriteOff > 0) {
      await tx.financeLedger.create({ data: { employeeId: input.employeeId, type: "DISPUTE_FINAL_WRITE_OFF", amount: -preview.totalDisputeWriteOff, note: `Финальные списания диспутов за период ${preview.period.start.toISOString().slice(0, 10)} — ${preview.period.end.toISOString().slice(0, 10)}`, settlementId: createdSettlement.id } });
    }
    if (preview.bonusAmount > 0) {
      await tx.financeLedger.create({ data: { employeeId: input.employeeId, type: "BONUS", amount: preview.bonusAmount, note: "Бонус при выплате банка", settlementId: createdSettlement.id } });
    }
    await tx.financeLedger.create({ data: { employeeId: input.employeeId, type: "BANK_PAYOUT", amount: -input.amount, note: "Выплата банка после финального расчёта продаж", settlementId: createdSettlement.id } });
    for (const row of preview.disputeWriteOffs) {
      await tx.settlementDisputeWriteOff.create({ data: { settlementId: createdSettlement.id, issueRecordId: row.issueId, courierId: input.employeeId, decisionId: row.decisionId, retailPrice: row.retailPrice, couponPercent: row.couponPercent, statusRuleName: preview.statusName, writeOffAmount: row.writeOff, calculationData: row.calculationData } });
      await tx.issueRecord.update({ where: { id: row.issueId }, data: { writeOff: row.writeOff, calculationData: row.calculationData } });
    }
    return createdSettlement;
  });
  await logAction({ userLogin: input.actorLogin, action: "Выплата банка", entity: "MonthlySettlement", details: { settlementId: settlement.id, courierId: input.employeeId, periodFrom: preview.period.start, periodTo: preview.period.end, soldQuantity: preview.soldQuantity, uploadedQuantity: preview.uploadedQuantity, disputeCount: preview.disputeCount, openDisputeCount: preview.openDisputeCount, disputePercent: preview.disputePercent, statusName: preview.statusName, writeOffIssues: preview.disputeWriteOffs.map((row) => ({ issueId: row.issueId, orderNumber: row.orderNumber, writeOff: row.writeOff })), totalDisputeWriteOff: preview.totalDisputeWriteOff, bonus: preview.bonusAmount, paid: input.amount, finalBankBalance: preview.finalBankBalance } });
  return { settlementId: settlement.id, paid: input.amount, bonus: preview.bonusAmount, totalDisputeWriteOff: preview.totalDisputeWriteOff, remainingBank: preview.finalBankBalance };
}

export async function upsertMarketplace(input: { actorLogin: string; id?: string; name: string; status: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = input.id ? await db.marketplace.findUnique({ where: { id: input.id } }) : null;
  const marketplace = input.id ? await db.marketplace.update({ where: { id: input.id }, data: { name: input.name, status: input.status } }) : await db.marketplace.create({ data: { name: input.name, status: input.status } });
  await logAction({ userLogin: input.actorLogin, action: input.id ? "Редактирование МП" : "Добавление МП", entity: "Marketplace", details: marketplace, oldValue, newValue: marketplace });
  return marketplace;
}

export async function deleteMarketplace(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.marketplace.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("МП не найден");
  const [issueUsage, entries] = await Promise.all([
    db.issueRecord.count({ where: { marketplace: oldValue.name } }),
    db.dataEntry.findMany({ select: { mpDistribution: true } }),
  ]);
  const entryUsage = entries.some((entry) => entry.mpDistribution.includes(`"${oldValue.name}"`));
  if (issueUsage > 0 || entryUsage) {
    const marketplace = await db.marketplace.update({ where: { id: input.id }, data: { status: "INACTIVE" } });
    await logAction({ userLogin: input.actorLogin, action: "Архивация МП", entity: "Marketplace", details: { id: input.id, reason: "Используется в истории CRM" }, oldValue, newValue: marketplace });
    return { success: true, mode: "ARCHIVED", item: marketplace };
  }
  await db.marketplace.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление МП", entity: "Marketplace", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function updateCity(input: { actorLogin: string; id: string; name?: string; status?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.city.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Город не найден");
  const city = await db.city.update({ where: { id: input.id }, data: { name: input.name ?? oldValue.name, status: input.status ?? oldValue.status } });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование города", entity: "City", details: { id: input.id }, oldValue, newValue: city });
  return city;
}

export async function deleteCity(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.city.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Город не найден");
  const [batchUsage, entryUsage] = await Promise.all([
    db.batch.count({ where: { cityId: input.id } }),
    db.dataEntry.count({ where: { cityId: input.id } }),
  ]);
  if (batchUsage > 0 || entryUsage > 0) {
    const city = await db.city.update({ where: { id: input.id }, data: { status: "INACTIVE" } });
    await logAction({ userLogin: input.actorLogin, action: "Архивация города", entity: "City", details: { id: input.id, reason: "Есть партии или вводы данных" }, oldValue, newValue: city });
    return { success: true, mode: "ARCHIVED", item: city };
  }
  await db.cityProductSetting.deleteMany({ where: { cityId: input.id } });
  await db.priceRate.deleteMany({ where: { cityId: input.id } });
  await db.stashType.deleteMany({ where: { cityId: input.id } });
  await db.city.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление города", entity: "City", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function updateProduct(input: { actorLogin: string; id: string; name: string; status?: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.product.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Товар не найден");
  const name = input.name.trim();
  if (!name) throw new Error("Название товара обязательно");
  const product = await db.product.update({ where: { id: input.id }, data: { name, status: input.status ?? oldValue.status } });
  await logAction({ userLogin: input.actorLogin, action: "Переименование товара", entity: "Product", details: { id: input.id, name }, oldValue, newValue: product });
  return product;
}

export async function deleteProduct(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.product.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Товар не найден");
  const [batchUsage, entryUsage] = await Promise.all([
    db.batch.count({ where: { productId: input.id } }),
    db.dataEntry.count({ where: { productId: input.id } }),
  ]);
  if (batchUsage > 0 || entryUsage > 0) {
    const product = await db.product.update({ where: { id: input.id }, data: { status: "INACTIVE" } });
    await logAction({ userLogin: input.actorLogin, action: "Архивация товара", entity: "Product", details: { id: input.id, reason: "Есть партии или вводы данных" }, oldValue, newValue: product });
    return { success: true, mode: "ARCHIVED", item: product };
  }
  await db.cityProductSetting.deleteMany({ where: { productId: input.id } });
  await db.priceRate.deleteMany({ where: { productId: input.id } });
  await db.stashType.deleteMany({ where: { productId: input.id } });
  await db.product.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление товара", entity: "Product", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function updateStashType(input: { actorLogin: string; id: string; name: string; surcharge: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.stashType.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Тип клада не найден");
  const item = await db.stashType.update({ where: { id: input.id }, data: { name: input.name, surcharge: input.surcharge } });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование типа клада", entity: "StashType", details: { id: input.id }, oldValue, newValue: item });
  return item;
}

export async function deleteStashType(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.stashType.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Тип клада не найден");
  await db.stashType.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление типа клада", entity: "StashType", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function updateCityProductSetting(input: { actorLogin: string; cityId: string; productId: string; mode: Mode; status: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.cityProductSetting.findUnique({ where: { cityId_productId_mode: { cityId: input.cityId, productId: input.productId, mode: input.mode } } });
  const item = await db.cityProductSetting.upsert({
    where: { cityId_productId_mode: { cityId: input.cityId, productId: input.productId, mode: input.mode } },
    create: { cityId: input.cityId, productId: input.productId, mode: input.mode, status: input.status },
    update: { status: input.status },
  });
  await logAction({ userLogin: input.actorLogin, action: "Вкл/выкл товара в городе", entity: "CityProductSetting", details: { cityId: input.cityId, productId: input.productId, mode: input.mode, status: input.status }, oldValue, newValue: item });
  return item;
}

export async function updatePriceRate(input: { actorLogin: string; cityId: string; productId: string; mode: Mode; weight: number; price: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  assertPositive(input.weight, "Вес");
  assertNonNegative(input.price, "Цена");
  const oldValue = await db.priceRate.findUnique({ where: { cityId_productId_mode_weight: { cityId: input.cityId, productId: input.productId, mode: input.mode, weight: input.weight } } });
  const item = await db.priceRate.upsert({
    where: { cityId_productId_mode_weight: { cityId: input.cityId, productId: input.productId, mode: input.mode, weight: input.weight } },
    create: { cityId: input.cityId, productId: input.productId, mode: input.mode, weight: input.weight, price: input.price },
    update: { price: input.price },
  });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование цены", entity: "PriceRate", details: { cityId: input.cityId, productId: input.productId, mode: input.mode, weight: input.weight, price: input.price }, oldValue, newValue: item });
  return item;
}

export async function deletePriceRate(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.priceRate.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Строка цены не найдена");
  await db.priceRate.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление строки цены", entity: "PriceRate", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function createCourierStatusRule(input: { actorLogin: string; name: string; minPercent: number; maxPercent?: number | null; description: string; paysWhat: string; returnRules?: DisputeRuleConfig; returnLogic?: string; returnPercent?: number; couponRules?: DisputeRuleConfig; couponLogic?: string; couponPercent?: number; manualMode?: boolean; workBlocked?: boolean; blockPayouts: boolean; payoutLimit?: number | null; depositRequired: number; extraCriteria?: string | null }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const name = input.name.trim();
  if (!name) throw new Error("Название статуса обязательно");
  assertNonNegative(input.minPercent, "Мин %");
  if (input.maxPercent !== undefined && input.maxPercent !== null) assertNonNegative(input.maxPercent, "Макс %");
  const existing = await db.courierStatusRule.findFirst({ where: { name } });
  if (existing) throw new Error("Статус с таким названием уже есть");
  const returnLogic = normalizeDisputeLogic(input.returnLogic ?? "NONE");
  const couponLogic = normalizeDisputeLogic(input.couponLogic ?? "NONE");
  const returnRules = normalizeRuleConfig(input.returnRules, legacyLogicToRuleConfig(returnLogic, input.returnPercent ?? 0));
  const couponRules = normalizeRuleConfig(input.couponRules, legacyLogicToRuleConfig(couponLogic, input.couponPercent ?? 0));
  const item = await db.courierStatusRule.create({
    data: { name, minPercent: input.minPercent, maxPercent: input.maxPercent ?? null, description: input.description, paysWhat: input.paysWhat, returnRules: json(returnRules), returnLogic, returnPercent: Number(input.returnPercent ?? 0), couponRules: json(couponRules), couponLogic, couponPercent: Number(input.couponPercent ?? 0), manualMode: Boolean(input.manualMode), workBlocked: Boolean(input.workBlocked), blockPayouts: input.blockPayouts, payoutLimit: input.payoutLimit ?? null, depositRequired: input.depositRequired, extraCriteria: input.extraCriteria ?? null },
  });
  await logAction({ userLogin: input.actorLogin, action: "Добавление статуса курьера", entity: "CourierStatusRule", details: { id: item.id }, newValue: item });
  return item;
}

export async function updateCourierStatusRule(input: { actorLogin: string; id: string; name: string; minPercent: number; maxPercent?: number | null; description: string; paysWhat: string; returnRules?: DisputeRuleConfig; returnLogic?: string; returnPercent?: number; couponRules?: DisputeRuleConfig; couponLogic?: string; couponPercent?: number; manualMode?: boolean; workBlocked?: boolean; blockPayouts: boolean; payoutLimit?: number | null; depositRequired: number; extraCriteria?: string | null }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.courierStatusRule.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Статус не найден");
  const name = input.name.trim();
  if (!name) throw new Error("Название статуса обязательно");
  assertNonNegative(input.minPercent, "Мин %");
  if (input.maxPercent !== undefined && input.maxPercent !== null) assertNonNegative(input.maxPercent, "Макс %");
  const duplicate = await db.courierStatusRule.findFirst({ where: { name } });
  if (duplicate && duplicate.id !== input.id) throw new Error("Статус с таким названием уже есть");
  const returnLogic = normalizeDisputeLogic(input.returnLogic ?? oldValue.returnLogic);
  const couponLogic = normalizeDisputeLogic(input.couponLogic ?? oldValue.couponLogic);
  const returnRules = normalizeRuleConfig(input.returnRules, legacyLogicToRuleConfig(returnLogic, input.returnPercent ?? oldValue.returnPercent ?? 0));
  const couponRules = normalizeRuleConfig(input.couponRules, legacyLogicToRuleConfig(couponLogic, input.couponPercent ?? oldValue.couponPercent ?? 0));
  const item = await db.courierStatusRule.update({
    where: { id: input.id },
    data: { name, minPercent: input.minPercent, maxPercent: input.maxPercent ?? null, description: input.description, paysWhat: input.paysWhat, returnRules: json(returnRules), returnLogic, returnPercent: Number(input.returnPercent ?? oldValue.returnPercent ?? 0), couponRules: json(couponRules), couponLogic, couponPercent: Number(input.couponPercent ?? oldValue.couponPercent ?? 0), manualMode: Boolean(input.manualMode ?? oldValue.manualMode), workBlocked: Boolean(input.workBlocked ?? oldValue.workBlocked), blockPayouts: input.blockPayouts, payoutLimit: input.payoutLimit ?? null, depositRequired: input.depositRequired, extraCriteria: input.extraCriteria ?? null },
  });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование статуса курьера", entity: "CourierStatusRule", details: { id: input.id }, oldValue, newValue: item });
  return item;
}

export async function deleteCourierStatusRule(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.courierStatusRule.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Статус не найден");
  const total = await db.courierStatusRule.count();
  if (total <= 1) throw new Error("Нельзя удалить последний статус курьера");
  await db.courierStatusRule.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление статуса курьера", entity: "CourierStatusRule", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function restoreDefaultCourierStatusRules(input: { actorLogin: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const restored = await ensureDefaultCourierStatusRules(input.actorLogin);
  return { success: true, restored };
}

export async function updateSetting(input: { actorLogin: string; key: string; value: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.appSetting.findUnique({ where: { key: input.key } });
  const setting = await db.appSetting.upsert({ where: { key: input.key }, create: { key: input.key, value: input.value }, update: { value: input.value } });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование настроек", entity: "AppSetting", details: { key: input.key }, oldValue, newValue: setting });
  return setting;
}

export async function updateHandLimitRules(input: { actorLogin: string; rules: HandLimitRule[] }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const cleanRules = input.rules
    .map((rule) => ({
      minDisputePercent: Number(rule.minDisputePercent ?? 0),
      maxDisputePercent: Number(rule.maxDisputePercent),
      maxHandPercent: Number(rule.maxHandPercent),
      payoutLimit: rule.payoutLimit === undefined || rule.payoutLimit === null ? undefined : Number(rule.payoutLimit),
      blockPayouts: Boolean(rule.blockPayouts),
    }))
    .filter((rule) => Number.isFinite(rule.maxDisputePercent) && Number.isFinite(rule.maxHandPercent));
  const oldValue = await db.appSetting.findUnique({ where: { key: "handLimitRules" } });
  const setting = await db.appSetting.upsert({ where: { key: "handLimitRules" }, create: { key: "handLimitRules", value: json(cleanRules) }, update: { value: json(cleanRules) } });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование лимитов на руки", entity: "AppSetting", details: { key: "handLimitRules" }, oldValue, newValue: setting });
  return setting;
}

export async function updateBonusRules(input: { actorLogin: string; settings: BonusSettings }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const cleanSettings: BonusSettings = {
    period: input.settings.period ?? "MONTH",
    maxPercent: Number(input.settings.maxPercent ?? 15),
    depositMskSpb: Number(input.settings.depositMskSpb ?? 250000),
    depositRegions: Number(input.settings.depositRegions ?? 350000),
    addressThreshold: Number(input.settings.addressThreshold ?? 600),
    rules: (input.settings.rules ?? []).map((rule) => ({
      name: rule.name,
      enabled: rule.enabled !== false,
      bonusPercent: Number(rule.bonusPercent),
      minAddresses: Number(rule.minAddresses ?? 0),
      maxDisputePercent: Number(rule.maxDisputePercent ?? 999),
      depositRequired: Number(rule.depositRequired ?? input.settings.depositMskSpb ?? 250000),
      logic: rule.logic ?? "",
    })),
  };
  const oldValue = await db.appSetting.findUnique({ where: { key: "bonusRules" } });
  const setting = await db.appSetting.upsert({ where: { key: "bonusRules" }, create: { key: "bonusRules", value: json(cleanSettings) }, update: { value: json(cleanSettings) } });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование бонусов", entity: "AppSetting", details: { key: "bonusRules" }, oldValue, newValue: setting });
  return setting;
}

export async function addProblemType(input: { actorLogin: string; name: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const item = await db.problemType.create({ data: { name: input.name } });
  await logAction({ userLogin: input.actorLogin, action: "Добавление типа проблемы", entity: "ProblemType", details: item, newValue: item });
  return item;
}

export async function updateProblemType(input: { actorLogin: string; id: string; name: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.problemType.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Тип проблемы не найден");
  const item = await db.problemType.update({ where: { id: input.id }, data: { name: input.name } });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование типа проблемы", entity: "ProblemType", details: item, oldValue, newValue: item });
  return item;
}

export async function deleteProblemType(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.problemType.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Тип проблемы не найден");
  const issues = await db.issueRecord.findMany({ select: { problemIds: true } });
  const used = issues.some((issue) => safeParseJson<string[]>(issue.problemIds, []).includes(input.id));
  if (used) throw new Error("Тип проблемы уже используется в тикетах/диспутах. Удаление запрещено, чтобы не сломать историю.");
  await db.problemType.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление типа проблемы", entity: "ProblemType", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function addDisputeDecision(input: { actorLogin: string; name: string; calcType: string; percent?: number; manualAmount?: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const item = await db.disputeDecision.create({ data: { name: input.name, calcType: input.calcType, percent: input.percent ?? 0, manualAmount: input.manualAmount ?? 0 } });
  await logAction({ userLogin: input.actorLogin, action: "Добавление решения диспута", entity: "DisputeDecision", details: item, newValue: item });
  return item;
}

export async function updateDisputeDecision(input: { actorLogin: string; id: string; name: string; calcType?: string; percent?: number; manualAmount?: number }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.disputeDecision.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Решение диспута не найдено");
  const item = await db.disputeDecision.update({
    where: { id: input.id },
    data: { name: input.name, calcType: input.calcType ?? oldValue.calcType, percent: input.percent ?? oldValue.percent, manualAmount: input.manualAmount ?? oldValue.manualAmount },
  });
  await logAction({ userLogin: input.actorLogin, action: "Редактирование решения диспута", entity: "DisputeDecision", details: item, oldValue, newValue: item });
  return item;
}

export async function deleteDisputeDecision(input: { actorLogin: string; id: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  const oldValue = await db.disputeDecision.findUnique({ where: { id: input.id } });
  if (!oldValue) throw new Error("Решение диспута не найдено");
  const usage = await db.issueRecord.count({ where: { decisionId: input.id } });
  if (usage > 0) throw new Error("Решение уже используется в закрытых диспутах. Удаление запрещено, чтобы сохранить историю.");
  await db.disputeDecision.delete({ where: { id: input.id } });
  await logAction({ userLogin: input.actorLogin, action: "Удаление решения диспута", entity: "DisputeDecision", details: oldValue, oldValue });
  return { success: true, mode: "DELETED", item: oldValue };
}

export async function clearLogs(input: { actorLogin: string }) {
  await requireActor(input.actorLogin, ["SUPER_ADMIN"]);
  await db.appLog.deleteMany();
  await logAction({ userLogin: input.actorLogin, action: "Очистить историю логов", entity: "AppLog", details: "История логов очищена" });
  return { success: true };
}
