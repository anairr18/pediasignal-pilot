import {
  users,
  simulations,
  waitlist,
  type User,
  type InsertUser,
  type Simulation,
  type InsertSimulation,
  type Waitlist,
  type InsertWaitlist
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { encryption } from "./security";

const encryptData = (data: any) => {
  if (!data) return data;
  if (typeof data === 'string') {
    return encryption.encryptPHI(data);
  }
  if (typeof data === 'object') {
    return encryption.encryptPHI(JSON.stringify(data));
  }
  return encryption.encryptPHI(String(data));
};

const decryptData = (encryptedData: any) => {
  if (!encryptedData) return encryptedData;
  // If data doesn't look like our encrypted format (3 parts separated by :), return as is
  // This handles migration or mixed data during dev
  if (typeof encryptedData === 'string' && !encryptedData.includes(':')) {
    return encryptedData;
  }

  try {
    const decrypted = encryption.decryptPHI(encryptedData);
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    console.warn('Failed to decrypt data, returning original:', err);
    return encryptedData;
  }
};

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Simulation operations
  createSimulation(simulation: InsertSimulation): Promise<Simulation>;
  updateSimulation(id: number, updates: Partial<Simulation>): Promise<Simulation>;
  getSimulation(id: number): Promise<Simulation | undefined>;
  getUserSimulations(userId: number): Promise<Simulation[]>;

  // Waitlist operations
  addToWaitlist(entry: InsertWaitlist): Promise<Waitlist>;
  getWaitlistEntries(): Promise<Waitlist[]>;
  updateWaitlistStatus(id: number, status: string): Promise<void>;
  deleteWaitlistEntry(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user || typeof user !== 'object') return undefined;
    const typedUser = user as any;
    if (!typedUser.username || !typedUser.email) return undefined;
    return typedUser as User;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user || typeof user !== 'object') return undefined;
    const typedUser = user as any;
    if (!typedUser.username || !typedUser.email) return undefined;
    return typedUser as User;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || typeof user !== 'object') return undefined;
    const typedUser = user as any;
    if (!typedUser.username || !typedUser.email) return undefined;
    return typedUser as User;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    if (!user || typeof user !== 'object') {
      throw new Error('Failed to create user');
    }
    const typedUser = user as any;
    if (!typedUser.username) {
      throw new Error('Failed to create user - missing username');
    }
    return typedUser as User;
  }

  async createSimulation(simulation: InsertSimulation): Promise<Simulation> {
    try {
      // Encrypt sensitive fields
      const encryptedSimulation = {
        ...simulation,
        vitals: simulation.vitals ? encryptData(simulation.vitals) : simulation.vitals,
        interventions: simulation.interventions ? encryptData(simulation.interventions) : simulation.interventions
      };

      const [newSimulation] = await db.insert(simulations).values(encryptedSimulation).returning();
      if (!newSimulation || typeof newSimulation !== 'object') {
        throw new Error('Failed to create simulation');
      }

      const typedSimulation = newSimulation as any;
      if (!typedSimulation.userId || !typedSimulation.caseType) {
        throw new Error('Failed to create simulation - missing required fields');
      }

      // Decrypt for return value
      return {
        ...typedSimulation,
        vitals: typedSimulation.vitals ? decryptData(typedSimulation.vitals) : typedSimulation.vitals,
        interventions: typedSimulation.interventions ? decryptData(typedSimulation.interventions) : typedSimulation.interventions
      } as Simulation;
    } catch (dbError) {
      console.error('Database failure:', dbError);
      // Removed silent fallback to in-memory storage to prevent data loss
      throw new Error('Database unavailable - cannot save simulation');
    }
  }

  async updateSimulation(id: number, updates: Partial<Simulation>): Promise<Simulation> {
    // Encrypt sensitive updates
    const encryptedUpdates = {
      ...updates,
      vitals: updates.vitals ? encryptData(updates.vitals) : updates.vitals,
      interventions: updates.interventions ? encryptData(updates.interventions) : updates.interventions,
      updatedAt: new Date()
    };

    const [updatedSimulation] = await db
      .update(simulations)
      .set(encryptedUpdates)
      .where(eq(simulations.id, id))
      .returning();

    if (!updatedSimulation || !updatedSimulation.userId) {
      throw new Error('Failed to update simulation');
    }

    // Decrypt for return value
    return {
      ...updatedSimulation,
      vitals: updatedSimulation.vitals ? decryptData(updatedSimulation.vitals) : updatedSimulation.vitals,
      interventions: updatedSimulation.interventions ? decryptData(updatedSimulation.interventions) : updatedSimulation.interventions
    } as Simulation;
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [simulation] = await db.select().from(simulations).where(eq(simulations.id, id));
    if (!simulation || typeof simulation !== 'object') return undefined;

    const typedSimulation = simulation as any;
    if (!typedSimulation.userId) return undefined;

    // Decrypt sensitive medical data for return
    return {
      ...typedSimulation,
      vitals: typedSimulation.vitals ? decryptData(typedSimulation.vitals) : typedSimulation.vitals,
      interventions: typedSimulation.interventions ? decryptData(typedSimulation.interventions) : typedSimulation.interventions
    } as Simulation;
  }

  async getUserSimulations(userId: number): Promise<Simulation[]> {
    const simulationsData = await db
      .select()
      .from(simulations)
      .where(eq(simulations.userId, userId));

    // Decrypt sensitive medical data for return
    return simulationsData
      .filter((simulation: any) => simulation && simulation.userId)
      .map((simulation: any) => ({
        ...simulation,
        vitals: simulation.vitals ? decryptData(simulation.vitals) : simulation.vitals,
        interventions: simulation.interventions ? decryptData(simulation.interventions) : simulation.interventions
      })) as Simulation[];
  }


  // Waitlist operations
  async addToWaitlist(entry: InsertWaitlist): Promise<Waitlist> {
    const [newEntry] = await db
      .insert(waitlist)
      .values(entry)
      .returning();
    if (!newEntry || typeof newEntry !== 'object') {
      throw new Error('Failed to add to waitlist');
    }
    const typedEntry = newEntry as any;
    if (!typedEntry.email) {
      throw new Error('Failed to add to waitlist - missing email');
    }
    return typedEntry as Waitlist;
  }

  async getWaitlistEntries(): Promise<Waitlist[]> {
    const entries = await db.select()
      .from(waitlist);

    if (Array.isArray(entries)) {
      return entries.filter((entry: any) => entry && entry.email) as Waitlist[];
    }
    return [];
  }

  async updateWaitlistStatus(id: number, status: string): Promise<void> {
    await db
      .update(waitlist)
      .set({ status, updatedAt: new Date() })
      .where(eq(waitlist.id, id));
  }

  async deleteWaitlistEntry(id: number): Promise<void> {
    await db.delete(waitlist).where(eq(waitlist.id, id));
  }
}

export const storage = new DatabaseStorage();
