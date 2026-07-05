'use client'

import { useRouter } from 'next/navigation'
import { signOut } from '@/auth/client'
import { useCurrentRole } from '@/hooks/use-current-role'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

export function CenterMenu() {
  const router = useRouter()
  const role = useCurrentRole()
  const isAdmin = role === 'center_admin'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="...">...</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/centro/perfil" className="flex items-center justify-between" role="menuitem">
            Ajustes
            <ChevronRight className="h-4 w-4" />
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/centro/equipo" className="flex items-center justify-between" role="menuitem">
                Invitar miembros
                <ChevronRight className="h-4 w-4" />
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center justify-between"
          role="menuitem"
        >
          Cerrar sesión
          <ChevronRight className="h-4 w-4" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
