import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "@/components/AuthForms";
import SiteBadge from "@/components/SiteBadge";

export const metadata = { title: "注册" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto max-w-sm pt-8">
      <div className="mb-5 text-center">
        <SiteBadge className="h-14 w-14" />
        <h1 className="mt-2 text-lg font-semibold">注册 HSFZ BBS 账号</h1>
        <p className="text-sm text-muted">面向华附在校同学与校友</p>
      </div>

      <div className="mb-4 rounded-md border border-brand/20 bg-brand/10 px-3 py-2.5 text-sm text-brand">
        本论坛采用 <b>注册审核制</b>：提交注册申请后，需等待管理员在后台批准，方可登录发帖。
        校友名单内的同学（姓名 + 学号匹配）可<strong>免审核直接开通</strong>，见注册表单下方的免审核通道。
      </div>

      <div className="card p-5">
        <RegisterForm />
      </div>
    </div>
  );
}
