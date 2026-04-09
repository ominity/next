declare module "react" {
  export type Key = string | number;

  export interface ReactElement<P = Record<string, unknown>, T = unknown> {
    readonly type: T;
    readonly props: P;
    readonly key: Key | null;
  }

  export type ReactNode = unknown;

  export interface CSSProperties {
    [key: string]: string | number | undefined;
  }

  export type Dispatch<TValue> = (value: TValue) => void;

  export type SetStateAction<TValue> = TValue | ((previousState: TValue) => TValue);

  export interface MutableRefObject<TValue> {
    current: TValue;
  }

  export interface RefObject<TValue> {
    readonly current: TValue | null;
  }

  export interface ComponentType<P = Record<string, unknown>> {
    (props: P): ReactElement | null;
  }

  export type ElementType<P = Record<string, unknown>> = ComponentType<P> | string;

  export interface ChangeEvent<TElement = Element> {
    readonly target: TElement & {
      value?: string;
      checked?: boolean;
    };
    readonly currentTarget: TElement & {
      value?: string;
      checked?: boolean;
    };
  }

  export const Fragment: unique symbol;

  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: ReadonlyArray<unknown>
  ): ReactElement;

  export function useState<TValue>(
    initialState: TValue | (() => TValue),
  ): [TValue, Dispatch<SetStateAction<TValue>>];

  export function useEffect(
    effect: () => void | (() => void),
    dependencies?: ReadonlyArray<unknown>,
  ): void;

  export function useMemo<TValue>(
    factory: () => TValue,
    dependencies: ReadonlyArray<unknown>,
  ): TValue;

  export function useRef<TValue>(initialValue: TValue): MutableRefObject<TValue>;

  export function useRef<TValue>(initialValue: TValue | null): RefObject<TValue>;

  export function useCallback<TValue extends (...args: any[]) => any>(
    callback: TValue,
    dependencies: ReadonlyArray<unknown>,
  ): TValue;

  export function useId(): string;
}

declare module "react/jsx-runtime" {
  export const Fragment: unique symbol;

  export function jsx(
    type: unknown,
    props: Record<string, unknown>,
    key?: string,
  ): import("react").ReactElement;

  export function jsxs(
    type: unknown,
    props: Record<string, unknown>,
    key?: string,
  ): import("react").ReactElement;
}

declare namespace JSX {
  interface Element extends import("react").ReactElement {}

  interface IntrinsicAttributes {
    key?: import("react").Key | null | undefined;
  }

  interface IntrinsicElements {
    readonly [elementName: string]: Record<string, unknown>;
  }
}
