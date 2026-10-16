"use client"

import useSWR, { type SWRConfiguration } from "swr"
import { fetcher, hzUrl, robotUrl } from "@/lib/client"

type Query = Record<string, string | number | boolean | undefined | null>

const defaults: SWRConfiguration = {
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  keepPreviousData: true,
}

export function useApi<T>(url: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(url, fetcher<T>, { ...defaults, ...config } as SWRConfiguration<T>)
}

/** A call for one server through the panel's gateway; `sub` null skips the request. */
export function useHz<T>(project: number, id: number, sub: string | null, query?: Query, config?: SWRConfiguration<T>) {
  return useApi<T>(sub === null ? null : hzUrl(project, id, sub, query), config)
}

/** The same for a dedicated server: its Robot account and number. */
export function useRobot<T>(account: number, number: number, sub: string | null, query?: Query, config?: SWRConfiguration<T>) {
  return useApi<T>(sub === null ? null : robotUrl(account, number, sub, query), config)
}
