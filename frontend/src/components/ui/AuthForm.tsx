import * as React from "react";
import { cn } from "@/lib/utils";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface AuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "login" | "signup";
  onSubmit?: (e: React.FormEvent) => void;
  onForgotPassword?: () => void;
  onSocialLogin?: (provider: "google" | "github" | "apple") => void;
  loading?: boolean;
}

export function AuthForm({
  type = "login",
  onSubmit,
  onForgotPassword,
  onSocialLogin,
  loading = false,
  className,
  ...props
}: AuthFormProps) {
  const isLogin = type === "login";
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div
      className={cn(
        "bg-bg-white-0 flex flex-col gap-6 w-[400px] max-w-full rounded-[16px] border border-stroke-soft-200 shadow-sm p-6",
        className
      )}
      {...props}
    >
      {/* Header */}
      <div className="flex flex-col gap-2 items-center text-center">
        <div className="size-12 bg-bg-weak-50 rounded-xl mb-2 flex items-center justify-center">
          <span className="font-bold text-xl text-primary-base">V</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-text-strong-950">
          {isLogin ? "Welcome back" : "Create an account"}
        </h2>
        <p className="text-sm text-text-sub-600">
          {isLogin ? "Please enter your details to sign in." : "Sign up to get started with VOIT."}
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-strong-950">Email</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="size-4 text-text-soft-400" />
            </div>
            <input
              type="email"
              name="email"
              className="flex w-full h-10 px-3 py-2 pl-9 bg-bg-white-0 border border-stroke-soft-200 rounded-[8px] text-sm text-text-strong-950 placeholder:text-text-disabled-300 focus:outline-none focus:ring-2 focus:ring-primary-base/20 focus:border-primary-base transition-colors"
              placeholder="Enter your email"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-strong-950">Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="size-4 text-text-soft-400" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              className="flex w-full h-10 px-3 py-2 pl-9 pr-10 bg-bg-white-0 border border-stroke-soft-200 rounded-[8px] text-sm text-text-strong-950 placeholder:text-text-disabled-300 focus:outline-none focus:ring-2 focus:ring-primary-base/20 focus:border-primary-base transition-colors"
              placeholder={isLogin ? "Enter your password" : "Create a password"}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-soft-400 hover:text-text-strong-950 transition-colors"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="flex items-center justify-between mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 rounded border-stroke-soft-200 text-primary-base focus:ring-primary-base/20"
            />
            <span className="text-sm font-medium text-text-strong-950">
              {isLogin ? "Remember me" : "I agree to terms"}
            </span>
          </label>
          {isLogin && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm font-medium text-primary-base hover:text-primary-dark transition-colors"
            >
              Forgot password?
            </button>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          variant="primary"
          className="mt-2 w-full"
          loading={loading}
        >
          {isLogin ? "Sign In" : "Sign Up"}
        </Button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-stroke-soft-200" />
        <span className="text-xs font-medium text-text-sub-600 uppercase">Or continue with</span>
        <div className="flex-1 h-px bg-stroke-soft-200" />
      </div>

      {/* Social Logins */}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => onSocialLogin?.("google")}
        >
          <span className="font-bold">G</span> Google
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => onSocialLogin?.("github")}
        >
          <span className="font-bold">Git</span> Github
        </Button>
      </div>
      
      {/* Footer */}
      <div className="text-center text-sm text-text-sub-600 mt-2">
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <button className="font-medium text-primary-base hover:text-primary-dark transition-colors">
          {isLogin ? "Sign up" : "Log in"}
        </button>
      </div>
    </div>
  );
}
