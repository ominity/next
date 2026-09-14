"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  OminityDebugCapability,
  OminityDebugSnapshot,
} from "./types.js";

type DebugCapabilityValue<TCapability extends OminityDebugCapability> =
  NonNullable<OminityDebugSnapshot[TCapability]>;

export interface OminityDebugContextValue {
  readonly enabled: boolean;
  readonly snapshot: OminityDebugSnapshot;
  register<TCapability extends OminityDebugCapability>(
    capability: TCapability,
    value: DebugCapabilityValue<TCapability>,
  ): () => void;
}

export interface OminityDebugProviderProps {
  readonly children: ReactNode;
  readonly enabled?: boolean;
  readonly initialSnapshot?: OminityDebugSnapshot;
}

const OminityDebugContext = createContext<OminityDebugContextValue | null>(null);

export function OminityDebugProvider(props: OminityDebugProviderProps) {
  const enabled = props.enabled ?? true;
  const [snapshot, setSnapshot] = useState<OminityDebugSnapshot>(props.initialSnapshot ?? {});

  useEffect(() => {
    if (props.initialSnapshot) {
      setSnapshot((previous) => ({ ...previous, ...props.initialSnapshot }));
    }
  }, [props.initialSnapshot]);

  const register = useCallback(<TCapability extends OminityDebugCapability>(
    capability: TCapability,
    value: DebugCapabilityValue<TCapability>,
  ) => {
    if (!enabled) {
      return () => undefined;
    }

    setSnapshot((previous) => ({
      ...previous,
      [capability]: value,
    }));

    return () => {
      setSnapshot((previous) => {
        if (previous[capability] !== value) {
          return previous;
        }

        const next = { ...previous };
        delete next[capability];
        return next;
      });
    };
  }, [enabled]);

  const value = useMemo<OminityDebugContextValue>(() => ({
    enabled,
    snapshot,
    register,
  }), [enabled, register, snapshot]);

  return (
    <OminityDebugContext.Provider value={value}>
      {props.children}
    </OminityDebugContext.Provider>
  );
}

export function useOminityDebugSnapshot(): OminityDebugSnapshot {
  return useContext(OminityDebugContext)?.snapshot ?? {};
}

export function useOminityDebugCapability<TCapability extends OminityDebugCapability>(
  capability: TCapability,
  value: DebugCapabilityValue<TCapability> | undefined,
  enabled = true,
): void {
  const context = useContext(OminityDebugContext);
  const contextEnabled = context?.enabled ?? false;
  const register = context?.register;

  useEffect(() => {
    if (!contextEnabled || !register || !enabled || typeof value === "undefined") {
      return;
    }

    return register(capability, value);
  }, [capability, contextEnabled, enabled, register, value]);
}
