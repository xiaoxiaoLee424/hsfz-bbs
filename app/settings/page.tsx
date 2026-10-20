import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { TitleBadge } from "@/components/TitleBadge";
import { ProfileForm, AvatarUploadForm, PasswordForm } from "@/components/ProfileForms";
import { ConfirmSubmit } from "@/components/SubmitButton";
import { removeAvatarAction } from "@/app/actions/profile";
import { userPostCount } from "@/lib/db";

export const metadata = { title: "账号设置" };

export default async function SettingsPage() {
  const sessionUser = await requireUser();
  const user = db
    .prepare(
      `SELECT id, username, nickname, avatar, custom_title, role, status, banned, grade, phone, email, bio, created_at
       FROM users WHERE id = ?`
    )
    .get(sessionUser.id) as import("@/lib/db").UserRow;
  const postCount = userPostCount(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">账号设置</h1>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar user={user} size={64} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{user.nickname}</p>
            <p className="text-sm text-muted">@{user.username}</p>
            <div className="mt-1 flex items-center gap-2">
              <TitleBadge customTitle={user.custom_title} postCount={postCount} />
              {user.role === "admin" && <span className="pill bg-brand text-white">管理员</span>}
            </div>
          </div>
          {user.avatar && (
            <form action={removeAvatarAction}>
              <ConfirmSubmit icon="trash" className="btn-danger" message="确定移除当前头像，恢复为默认字母头像？">
                移除头像
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="card-header">自定义头像</div>
          <AvatarUploadForm />
        </div>
        <div className="card">
          <div className="card-header">基本资料</div>
          <ProfileForm nickname={user.nickname} bio={user.bio} grade={user.grade} phone={user.phone} />
        </div>
        <div className="card md:col-span-2">
          <div className="card-header">修改密码</div>
          <div className="mx-auto w-full max-w-sm p-4">
            <PasswordForm />
          </div>
        </div>
      </div>

      <div className="card p-4 text-sm text-muted">
        想要专属头衔（如「版主」「校运冠军」）？去{" "}
        <Link href="/messages" className="link font-medium">
          我的消息
        </Link>{" "}
        提交一张头衔申请工单，管理员会尽快处理。
      </div>
    </div>
  );
}
