'use client';
import type { ButtonHTMLAttributes } from 'react';

/** Submit button that asks for confirmation first (progressive enhancement: works as a normal button without JS). */
export function ConfirmButton({ message, ...props }: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }} />;
}
