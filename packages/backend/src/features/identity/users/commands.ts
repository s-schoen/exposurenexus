import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";

export interface CreateUserCommand {
  userProfile: CreateUserProfile;
  performedBy: string;
}

export interface UpdateUserByIDCommand {
  id: string;
  userProfile: UpdateUserProfile;
  performedBy: string;
}

export interface UserCreatedOutcome {
  current: UserProfile;
  performedBy: string;
}

export interface UserUpdatedOutcome {
  previous: UserProfile;
  current: UserProfile;
  performedBy: string;
}

export interface IdentityUsers {
  /** Startup-only bootstrap; returns null when any user profile already exists. */
  createInitialAdmin(password: string): Promise<UserProfile | null>;
  listAll(): Promise<UserProfile[]>;
  getByID(id: string): Promise<UserProfile | null>;
  getByUsername(username: string): Promise<UserProfile | null>;
  create(command: CreateUserCommand): Promise<UserCreatedOutcome>;
  updateByID(command: UpdateUserByIDCommand): Promise<UserUpdatedOutcome | null>;
}
