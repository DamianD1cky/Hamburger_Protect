import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  label,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      <span>{label}</span>
      <div className="account-password-input">
        <input {...input} type={visible ? "text" : "password"} />
        <button
          type="button"
          aria-label={`${visible ? "隐藏" : "显示"}${label}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </label>
  );
}
