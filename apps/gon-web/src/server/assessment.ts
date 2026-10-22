import { jaccardSimilarity, normalizeForSearch } from "./text";
import type {
  AssessmentCriterionResult,
  AssessmentResult,
  ModuleGraphNode,
  ModuleGraphRubric,
} from "./types";
import type { JsonRecord } from "./validation";

const ASSESSOR_VERSION = "deterministic-rubric-v1";

function includesPhrase(normalizedAnswer: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForSearch(phrase);
  return normalizedPhrase.length > 0 && normalizedAnswer.includes(normalizedPhrase);
}

function conceptGroups(node: ModuleGraphNode): string[][] {
  const raw = node.content.conceptTermGroups;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((group): group is unknown[] => Array.isArray(group))
    .map((group) => group.filter((item): item is string => typeof item === "string"))
    .filter((group) => group.length > 0);
}

function matchedGroupCount(normalizedAnswer: string, groups: string[][]): number {
  return groups.filter((group) => group.some((phrase) => includesPhrase(normalizedAnswer, phrase))).length;
}

function hasAny(normalizedAnswer: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includesPhrase(normalizedAnswer, phrase));
}

function hasSection(normalizedAnswer: string, section: string): boolean {
  return includesPhrase(normalizedAnswer, section);
}

function disclosureHasContent(value: JsonRecord): boolean {
  return Object.values(value).some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (Array.isArray(item)) return item.some((entry) => typeof entry === "string" ? entry.trim().length > 0 : Boolean(entry));
    if (typeof item === "boolean") return true;
    if (item && typeof item === "object") return disclosureHasContent(item as JsonRecord);
    return Boolean(item);
  });
}

export function hasRequiredBossDisclosures(sourceDisclosure: JsonRecord, aiAssistanceDisclosure: JsonRecord): boolean {
  const hasSources = disclosureHasContent(sourceDisclosure);
  const hasAiDisclosure =
    Object.prototype.hasOwnProperty.call(aiAssistanceDisclosure, "usedAi") || disclosureHasContent(aiAssistanceDisclosure);
  return hasSources && hasAiDisclosure;
}

interface CriterionEvaluation {
  passed: boolean;
  known: boolean;
  feedback: string;
}

function evaluateCriterion(
  criterionId: string,
  input: {
    node: ModuleGraphNode;
    answerText: string;
    normalizedAnswer: string;
    artifactIds: string[];
    sourceDisclosure: JsonRecord;
    aiAssistanceDisclosure: JsonRecord;
    similarity: number;
  },
): CriterionEvaluation {
  const groups = conceptGroups(input.node);
  const matchedGroups = matchedGroupCount(input.normalizedAnswer, groups);
  const answerLength = input.answerText.trim().length;

  switch (criterionId) {
    case "covers_core_ideas":
    case "accurate_core_ideas":
    case "two_factor_groups": {
      const passed = groups.length > 0 ? matchedGroups >= Math.min(2, groups.length) && answerLength >= 60 : false;
      return {
        passed,
        known: groups.length > 0,
        feedback: passed
          ? "Bài làm đã nêu ít nhất hai nhóm ý/bằng chứng chính."
          : "Hãy nêu rõ ít nhất hai nhóm ý chính và cách nguồn hỗ trợ các ý đó.",
      };
    }
    case "explains_limits": {
      const passed = hasAny(input.normalizedAnswer, [
        "giới hạn",
        "chưa đủ",
        "kiểm chứng",
        "bối cảnh",
        "không thể kết luận",
        "cần thêm",
      ]);
      return {
        passed,
        known: true,
        feedback: passed
          ? "Bài làm đã nhận diện giới hạn bằng chứng."
          : "Hãy nói rõ điều gì còn thiếu hoặc chưa đủ cơ sở để kết luận.",
      };
    }
    case "own_words": {
      const passed = answerLength >= 40 && input.similarity < 0.72;
      return {
        passed,
        known: true,
        feedback: passed
          ? "Cách diễn đạt cho thấy bạn đã viết lại bằng lời của mình."
          : "Bài làm còn quá gần đáp án/nguồn hoặc quá ngắn; hãy giải thích lại theo cách hiểu của bạn.",
      };
    }
    case "new_context": {
      const passed = hasSection(input.normalizedAnswer, "Bối cảnh mới") ||
        hasAny(input.normalizedAnswer, ["tình huống mới", "ngách", "dự án của tôi", "công việc của tôi", "cộng đồng của tôi"]);
      return {
        passed,
        known: true,
        feedback: passed
          ? "Bài làm đã đặt kiến thức vào một bối cảnh mới."
          : "Hãy thêm mục “Bối cảnh mới:” và mô tả tình huống khác ví dụ gốc.",
      };
    }
    case "mechanism_fit": {
      const passed = (hasSection(input.normalizedAnswer, "Cách áp dụng") || hasAny(input.normalizedAnswer, ["áp dụng", "thiết kế", "thực hiện"])) &&
        (matchedGroups >= 1 || answerLength >= 100);
      return {
        passed,
        known: true,
        feedback: passed
          ? "Cách áp dụng đã được nối với cơ chế/ý chính đã học."
          : "Hãy giải thích chính xác nguyên lý nào từ bài học sẽ được áp dụng và bằng hành động nào.",
      };
    }
    case "evidence_plan": {
      const passed = hasSection(input.normalizedAnswer, "Cách đo kết quả") ||
        hasAny(input.normalizedAnswer, ["đo kết quả", "tiêu chí", "kiểm chứng", "số liệu", "phản hồi từ"]);
      return {
        passed,
        known: true,
        feedback: passed
          ? "Bài làm có cách kiểm chứng kết quả."
          : "Hãy thêm tiêu chí hoặc bằng chứng sẽ dùng để biết cách áp dụng có hiệu quả hay không.",
      };
    }
    case "learning_goal": {
      const passed = hasSection(input.normalizedAnswer, "Mục tiêu học") && answerLength >= 120;
      return {
        passed,
        known: true,
        feedback: passed
          ? "Artifact đã nêu mục tiêu học."
          : "Hãy bắt đầu bằng mục “Mục tiêu học:” và nói rõ người dùng artifact sẽ học được gì.",
      };
    }
    case "provenance": {
      const passed = hasRequiredBossDisclosures(input.sourceDisclosure, input.aiAssistanceDisclosure);
      return {
        passed,
        known: true,
        feedback: passed
          ? "Nguồn và hỗ trợ AI đã được khai báo."
          : "Cần khai báo nguồn đã dùng và mức hỗ trợ AI trước khi Boss Proof có thể đạt.",
      };
    }
    case "core_value": {
      const passed = hasSection(input.normalizedAnswer, "Giá trị cốt lõi") && (matchedGroups >= 1 || answerLength >= 180);
      return {
        passed,
        known: true,
        feedback: passed
          ? "Artifact đã giải thích giá trị cốt lõi."
          : "Hãy thêm mục “Giá trị cốt lõi:” và giải thích bài học thật phía sau artifact.",
      };
    }
    case "usable_artifact": {
      const passed = hasSection(input.normalizedAnswer, "Nội dung artifact") &&
        (hasSection(input.normalizedAnswer, "Cách người khác sử dụng/kiểm tra") || input.artifactIds.length > 0) &&
        answerLength >= 220;
      return {
        passed,
        known: true,
        feedback: passed
          ? "Artifact đủ rõ để người khác sử dụng hoặc kiểm tra."
          : "Hãy mô tả nội dung artifact và cách người khác sử dụng/kiểm tra nó một cách cụ thể hơn.",
      };
    }
    default:
      return {
        passed: false,
        known: false,
        feedback: "Tiêu chí này chưa có deterministic rule an toàn trong VS1 nên cần người review.",
      };
  }
}

export function assessAttemptDeterministically(input: {
  node: ModuleGraphNode;
  rubric: ModuleGraphRubric;
  answerText: string;
  artifactIds: string[];
  sourceDisclosure: JsonRecord;
  aiAssistanceDisclosure: JsonRecord;
  sourceTexts?: string[];
}): AssessmentResult {
  const normalizedAnswer = normalizeForSearch(input.answerText);
  const sampleAnswer = typeof input.node.content.sampleAnswer === "string" ? input.node.content.sampleAnswer : "";
  const similarityCandidates = [sampleAnswer, ...(input.sourceTexts ?? [])].filter(Boolean);
  const similarity = similarityCandidates.reduce(
    (max, candidate) => Math.max(max, jaccardSimilarity(input.answerText, candidate)),
    0,
  );

  const evaluations = input.rubric.criteria.map((criterion) => ({
    criterion,
    evaluation: evaluateCriterion(criterion.id, {
      node: input.node,
      answerText: input.answerText,
      normalizedAnswer,
      artifactIds: input.artifactIds,
      sourceDisclosure: input.sourceDisclosure,
      aiAssistanceDisclosure: input.aiAssistanceDisclosure,
      similarity,
    }),
  }));

  const criteria: AssessmentCriterionResult[] = evaluations.map(({ criterion, evaluation }) => ({
    criterionId: criterion.id,
    passed: evaluation.passed,
    feedback: evaluation.feedback,
  }));

  const hasUnknownCriterion = evaluations.some(({ evaluation }) => !evaluation.known);
  const integritySignals: string[] = [];
  if (input.answerText.trim().length >= 50 && similarity >= 0.82) {
    integritySignals.push("high_similarity_to_source_or_sample");
  }

  if (integritySignals.length > 0) {
    return {
      decision: "pending_human_review",
      criteria,
      feedback:
        "Bài làm rất giống nguồn hoặc đáp án mẫu. Đây chỉ là tín hiệu cần giải thích/review thêm, không phải kết luận gian lận; XP chưa được ghi.",
      confidence: 0.65,
      assessorType: "deterministic",
      assessorVersion: ASSESSOR_VERSION,
      integritySignals,
    };
  }

  if (hasUnknownCriterion) {
    return {
      decision: "pending_human_review",
      criteria,
      feedback: "Rubric chứa tiêu chí chưa thể chấm deterministic một cách an toàn trong VS1; bài làm cần người review.",
      confidence: 0.55,
      assessorType: "deterministic",
      assessorVersion: ASSESSOR_VERSION,
      integritySignals,
    };
  }

  const requiredPassed = evaluations.every(({ criterion, evaluation }) => !criterion.required || evaluation.passed);
  let passed = requiredPassed;
  if (input.rubric.passRule.type === "weighted_threshold") {
    const totalWeight = evaluations.reduce((sum, item) => sum + item.criterion.weight, 0);
    const passedWeight = evaluations.reduce(
      (sum, item) => sum + (item.evaluation.passed ? item.criterion.weight : 0),
      0,
    );
    passed = requiredPassed && (totalWeight === 0 ? false : passedWeight / totalWeight >= (input.rubric.passRule.threshold ?? 1));
  }

  return {
    decision: passed ? "passed" : "needs_revision",
    criteria,
    feedback: passed
      ? "Bài làm đạt tất cả tiêu chí bắt buộc của rubric."
      : "Bài làm chưa đạt một hoặc nhiều tiêu chí bắt buộc. Hãy sửa theo feedback từng tiêu chí và nộp attempt mới.",
    confidence: passed ? 0.84 : 0.8,
    assessorType: "deterministic",
    assessorVersion: ASSESSOR_VERSION,
    integritySignals,
  };
}
