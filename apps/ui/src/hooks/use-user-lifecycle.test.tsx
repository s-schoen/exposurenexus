import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile
} from "@exposurenexus/types/model/user"
import type * as UserApi from "@/api/user.ts"
import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions
} from "@/api/user.ts"
import { useUserLifecycle } from "@/hooks/use-user-lifecycle.ts"

const {
  createUserRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateUserRequestMock
} = vi.hoisted(() => ({
  createUserRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateUserRequestMock: vi.fn()
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock
  }
}))

vi.mock("@/api/user.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof UserApi>()

  return {
    ...actual,
    createUser: createUserRequestMock,
    updateUser: updateUserRequestMock,
    useCreateUserMutation: () => ({
      mutateAsync: createUserRequestMock
    }),
    useUpdateUserMutation: () => ({
      mutateAsync: updateUserRequestMock
    })
  }
})

function createUserFixture(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: overrides.id ?? "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    username: overrides.username ?? "alice",
    displayName: overrides.displayName ?? "Alice Example",
    email: overrides.email ?? "alice@example.com",
    enabled: overrides.enabled ?? true,
    roleIds: overrides.roleIds ?? ["6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01"]
  }
}

function createUserPayload(
  overrides: Partial<CreateUserProfile> = {}
): CreateUserProfile {
  return {
    username: overrides.username ?? "alice",
    displayName: overrides.displayName ?? "Alice Example",
    email: overrides.email ?? "alice@example.com",
    enabled: overrides.enabled ?? true,
    password: overrides.password ?? "correct horse battery staple",
    roleIds: overrides.roleIds ?? ["6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01"]
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })
}

function renderLifecycleHook(queryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return {
    queryClient,
    ...renderHook(() => useUserLifecycle(), { wrapper })
  }
}

beforeEach(() => {
  createUserRequestMock.mockReset()
  toastErrorMock.mockReset()
  toastSuccessMock.mockReset()
  updateUserRequestMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useUserLifecycle", () => {
  it("creates users and invalidates user reads", async () => {
    const user = createUserFixture()
    const payload = createUserPayload()
    createUserRequestMock.mockResolvedValueOnce(user)
    const { queryClient, result } = renderLifecycleHook()
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined)

    let createdUser: UserProfile | null = null
    await act(async () => {
      createdUser = await result.current.createUser(payload)
    })

    expect(createdUser).toEqual(user)
    expect(createUserRequestMock).toHaveBeenCalledWith(payload)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListUsersQueryOptions().queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createUserByIDQueryOptions(user.id).queryKey,
      exact: true
    })
    expect(toastSuccessMock).toHaveBeenCalledWith("Created user Alice Example")
  })

  it("updates users, writes detail cache, and invalidates user reads", async () => {
    const user = createUserFixture({ displayName: "Alice Changed" })
    const payload: UpdateUserProfile = {
      displayName: "Alice Changed",
      email: "alice.changed@example.com",
      enabled: false,
      roleIds: ["5d5f5c6f-a9d6-4d49-9f4d-9462b873a902"]
    }
    updateUserRequestMock.mockResolvedValueOnce(user)
    const { queryClient, result } = renderLifecycleHook()
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined)

    let updatedUser: UserProfile | null = null
    await act(async () => {
      updatedUser = await result.current.updateUser(user.id, payload)
    })

    expect(updatedUser).toEqual(user)
    expect(updateUserRequestMock).toHaveBeenCalledWith({
      id: user.id,
      user: payload
    })
    expect(
      queryClient.getQueryData<UserProfile>(
        createUserByIDQueryOptions(user.id).queryKey
      )
    ).toEqual(user)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListUsersQueryOptions().queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createUserByIDQueryOptions(user.id).queryKey,
      exact: true
    })
    expect(toastSuccessMock).toHaveBeenCalledWith("Updated user Alice Changed")
  })

  it("reports update failures", async () => {
    const user = createUserFixture()
    const error = new Error("Update failed")
    updateUserRequestMock.mockRejectedValueOnce(error)
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const { result } = renderLifecycleHook()

    let updatedUser: UserProfile | null = user
    await act(async () => {
      updatedUser = await result.current.updateUser(user.id, {
        displayName: "Alice Changed",
        email: "alice.changed@example.com",
        enabled: false,
        roleIds: []
      })
    })

    expect(updatedUser).toBeNull()
    expect(toastErrorMock).toHaveBeenCalledWith(
      `Failed to update user: ${error}`
    )
    expect(consoleError).toHaveBeenCalledWith(error)
  })
})
