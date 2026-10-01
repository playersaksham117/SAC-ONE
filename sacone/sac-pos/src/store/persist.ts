import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Shared AsyncStorage-backed JSON storage for zustand `persist`. */
export const jsonStorage = createJSONStorage(() => AsyncStorage);
