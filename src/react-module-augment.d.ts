declare module "react" {
  export interface ProviderProps<T> {
    value: T;
    children?: ReactNode;
  }

  export interface ConsumerProps<T> {
    children: (value: T) => ReactNode;
  }

  export interface Provider<T> {
    (props: ProviderProps<T>): ReactElement | null;
  }

  export interface Consumer<T> {
    (props: ConsumerProps<T>): ReactElement | null;
  }

  export interface Context<T> {
    Provider: Provider<T>;
    Consumer: Consumer<T>;
    displayName?: string;
  }

  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void;
}
