import { useLayoutEffect, useState, type ReactNode } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Vs1App } from "./Vs1App";
import {
  installGonStorybookApi,
  type GonStorybookScenario,
} from "../stories/gonStorybookApi";

function GonMockApiProvider({
  scenario,
  children,
}: {
  scenario: GonStorybookScenario;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const restoreFetch = installGonStorybookApi(scenario);

    const preventStorybookNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (href === "/" || href?.startsWith("/api/auth/")) {
        event.preventDefault();
      }
    };

    document.addEventListener("click", preventStorybookNavigation, true);
    setReady(true);

    return () => {
      document.removeEventListener("click", preventStorybookNavigation, true);
      restoreFetch();
    };
  }, [scenario]);

  if (!ready) {
    return (
      <main className="page-shell" aria-live="polite">
        <section className="panel loading-card">
          <div>
            <p className="eyebrow">GON · Storybook</p>
            <h1>Đang lắp mock API…</h1>
            <p className="muted">
              Story này không gọi backend, Google OAuth, AI hay cơ sở dữ liệu thật.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

const withGonApi = (scenario: GonStorybookScenario): Decorator => {
  return (Story) => (
    <GonMockApiProvider scenario={scenario}>
      <Story />
    </GonMockApiProvider>
  );
};

const meta = {
  title: "Screens/GON VS1",
  component: Vs1App,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Các màn hình thật của Vs1App được chạy với mock API deterministic trong Storybook. Dữ liệu là fixture hư cấu, không phải bằng chứng production, Gemini/ADK thật hay xác minh danh tính.",
      },
    },
  },
  args: {
    googleConfigured: true,
    devAuthEnabled: true,
    devInviteHint: "GON-STORYBOOK-2026",
  },
  argTypes: {
    googleConfigured: {
      description: "Hiển thị nút Google như khi OAuth đã được cấu hình ở runtime.",
      control: "boolean",
    },
    devAuthEnabled: {
      description: "Chỉ dành cho môi trường dev/Storybook; production phải tắt.",
      control: "boolean",
    },
    devInviteHint: {
      description: "Mã mời mẫu được điền trước trong Storybook, không phải invite thật.",
      control: "text",
    },
  },
} satisfies Meta<typeof Vs1App>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SignedOutWithDev: Story = {
  name: "01 · Chưa đăng nhập — Google + Dev",
  decorators: [withGonApi("signed-out")],
  parameters: {
    docs: {
      description: {
        story:
          "Trạng thái signed-out của SCR-01. Nút Google được chặn điều hướng trong Storybook; Dev sign-in chuyển sang onboarding bằng mock API.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: /Biến tò mò thành bằng chứng học thật/i });
    await userEvent.click(
      canvas.getByRole("button", { name: /Tạo phiên dev local/i }),
    );
    await canvas.findByRole("heading", { name: /Hoàn tất điều kiện vào Private Alpha/i });
  },
};

export const SignedOutNeedsConfiguration: Story = {
  name: "02 · Chưa đăng nhập — thiếu cấu hình Auth",
  decorators: [withGonApi("signed-out")],
  args: {
    googleConfigured: false,
    devAuthEnabled: false,
    devInviteHint: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Fail-closed khi cả Google OAuth và Dev Auth đều chưa sẵn sàng. Giao diện không giả vờ có một đường đăng nhập khả dụng.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Google OAuth chưa được cấu hình/i);
    await canvas.findByText(/Hãy cấu hình Google OAuth/i);
  },
};

export const OnboardingNoAgeGate: Story = {
  name: "03 · Onboarding (invite + footprint — không còn cổng 18+)",
  decorators: [withGonApi("onboarding")],
  parameters: {
    docs: {
      description: {
        story:
          "PO đảo ngược định vị 18+ ngày 24/10: dự án không quan tâm độ tuổi — checkbox tự xác nhận đã bị gỡ. Payload attestation giữ nguyên fields theo contract P03.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: /Hoàn tất điều kiện vào Private Alpha/i });
    await canvas.findByText(/Không còn cổng độ tuổi/i);
    await canvas.getByRole("button", { name: /Kích hoạt tài khoản/i });
  },
};

export const ActiveWorkspace: Story = {
  name: "04 · Workspace — Search related, Brew hoàn tất",
  decorators: [withGonApi("active-retrieval")],
  parameters: {
    docs: {
      description: {
        story:
          "Workspace có prompt đã trích xuất và YouTube ở mức metadata-only. Brew trong fixture đã succeeded và chỉ tạo module ở trạng thái draft_private.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: /Bạn muốn học điều gì hôm nay/i });
    await canvas.findByText(/Có nội dung liên quan, chưa đủ hoàn toàn/i);
    const brewButton = canvas.getByRole("button", { name: /Brew đã hoàn tất/i });
    await expect(brewButton).toBeDisabled();
  },
};

export const NeedsClarification: Story = {
  name: "05 · Search cần làm rõ mục tiêu",
  decorators: [withGonApi("needs-clarification")],
  parameters: {
    docs: {
      description: {
        story:
          "Verdict needs_clarification không bị biến thành trang lỗi trống: người học nhận câu hỏi làm rõ và hướng sửa input.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: /Cần làm rõ mục tiêu/i });
    await canvas.findByText(/Bạn muốn giải thích, áp dụng hay tạo artifact/i);
    await canvas.findByText(/answer_clarification/i);
  },
};

export const OutputExplorer: Story = {
  name: "06 · Output Explorer — Candidate Outputs",
  decorators: [withGonApi("active-retrieval")],
  parameters: {
    docs: {
      description: {
        story:
          "CandidateSet mẫu có 6/10 hướng và hiển thị lý do thiếu thay vì bịa thêm card. Thứ tự có snapshot và reason codes.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const outputsNav = await canvas.findByRole("button", { name: /^Hướng học$/i });
    await userEvent.click(outputsNav);
    await canvas.findByRole("heading", { name: /Chọn hướng học phù hợp nhất/i });
    await canvas.findByText(/CandidateSet: 6\/10/i);
  },
};

export const JourneyPlayerRetrieval: Story = {
  name: "07 · Journey Player — Retrieval draft",
  decorators: [withGonApi("active-retrieval")],
  parameters: {
    docs: {
      description: {
        story:
          "Journey Fork riêng tư đang ở node Retrieval. Rubric được công bố trước; XP chưa được cộng cho việc chỉ đọc concept.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const learnNav = await canvas.findByRole("button", { name: /^Học & Boss Proof$/i });
    await userEvent.click(learnNav);
    await canvas.findByRole("heading", { name: /Tự giải thích mà không nhìn đáp án/i });
    await canvas.findByText(/Rubric được công bố trước/i);
  },
};

export const JourneyPlayerBossProof: Story = {
  name: "08 · Journey Player — Boss Proof",
  decorators: [withGonApi("active-boss")],
  parameters: {
    docs: {
      description: {
        story:
          "Retrieval và Transfer đã đạt, Boss Proof đang mở. Artifact phải khai báo nguồn và hỗ trợ AI; tương đồng nội dung không tự bị kết luận là gian lận.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const learnNav = await canvas.findByRole("button", { name: /^Học & Boss Proof$/i });
    await userEvent.click(learnNav);
    await canvas.findByRole("heading", { name: /Tạo artifact chứng minh bạn đã hiểu/i });
    await canvas.findByRole("button", { name: /Nộp Boss Proof/i });
  },
};

export const LifelongProgress: Story = {
  name: "09 · Hành trình và Lifelong Level",
  decorators: [withGonApi("active-retrieval")],
  parameters: {
    docs: {
      description: {
        story:
          "Numeric Level luôn bằng floor(LifetimeXP/100), không có trần. Forever là Era mở từ Lv.35+, không phải level cuối.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const progressNav = await canvas.findByRole("button", { name: /^Hành trình$/i });
    await userEvent.click(progressNav);
    await canvas.findByRole("heading", { name: /Bạn đang ở đâu trong hành trình trọn đời/i });
    await canvas.findByText(/Forever ở Lv\.35\+ là một Era mở/i);
  },
};

export const ProofVault: Story = {
  name: "10 · Proof Vault — đúng mức xác minh",
  decorators: [withGonApi("active-retrieval")],
  parameters: {
    docs: {
      description: {
        story:
          "Phân biệt System-recorded với Source-linked/self-declared. Storybook không biến link chứng chỉ mẫu thành Issuer-verified.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const proofNav = await canvas.findByRole("button", { name: /^Proof Vault$/i });
    await userEvent.click(proofNav);
    await canvas.findByRole("heading", { name: /Bằng chứng học của bạn, đúng mức xác minh/i });
    await canvas.findByText(/^system_recorded$/i);
    await canvas.findByText(/^source_linked$/i);
  },
};

export const BootstrapError: Story = {
  name: "11 · Bootstrap lỗi tạm thời",
  decorators: [withGonApi("bootstrap-error")],
  parameters: {
    docs: {
      description: {
        story:
          "Lỗi bootstrap 503 được hiển thị cùng requestId mẫu, trong khi giao diện vẫn giữ trạng thái chưa đăng nhập an toàn.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("alert");
    await canvas.findByText(/Storybook mock đang mô phỏng lỗi bootstrap/i);
  },
};

export const Loading: Story = {
  name: "12 · Đang tải phiên học",
  decorators: [withGonApi("loading")],
  parameters: {
    docs: {
      description: {
        story:
          "Mock bootstrap được trì hoãn khoảng 8 giây để rà soát loading card và thông điệp aria-live.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: /Đang tải phiên học/i });
  },
};
