import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import { db } from '../db';
import type { BabyProfile } from '../types';

interface AppState {
  babies: BabyProfile[];
  activeBabyId: string | null;
  loaded: boolean;
}

type Action =
  | { type: 'SET_BABIES'; babies: BabyProfile[] }
  | { type: 'ADD_BABY'; baby: BabyProfile }
  | { type: 'UPDATE_BABY'; baby: BabyProfile }
  | { type: 'DELETE_BABY'; id: string }
  | { type: 'SET_ACTIVE_BABY'; id: string };

const initialState: AppState = {
  babies: [],
  activeBabyId: null,
  loaded: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_BABIES':
      return {
        ...state,
        babies: action.babies,
        activeBabyId: action.babies.length > 0
          ? (state.activeBabyId && action.babies.find(b => b.id === state.activeBabyId)
            ? state.activeBabyId
            : action.babies[0].id)
          : null,
        loaded: true,
      };
    case 'ADD_BABY':
      return {
        ...state,
        babies: [...state.babies, action.baby],
        activeBabyId: state.activeBabyId ?? action.baby.id,
      };
    case 'UPDATE_BABY':
      return {
        ...state,
        babies: state.babies.map(b => b.id === action.baby.id ? action.baby : b),
      };
    case 'DELETE_BABY': {
      const remaining = state.babies.filter(b => b.id !== action.id);
      return {
        ...state,
        babies: remaining,
        activeBabyId: state.activeBabyId === action.id
          ? (remaining[0]?.id ?? null)
          : state.activeBabyId,
      };
    }
    case 'SET_ACTIVE_BABY':
      return { ...state, activeBabyId: action.id };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  activeBaby: BabyProfile | null;
}>({
  state: initialState,
  dispatch: () => {},
  activeBaby: null,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    db.babies.toArray().then(babies => {
      dispatch({ type: 'SET_BABIES', babies });
    });
  }, []);

  const activeBaby = state.babies.find(b => b.id === state.activeBabyId) ?? null;

  return (
    <AppContext.Provider value={{ state, dispatch, activeBaby }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
