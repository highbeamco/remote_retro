import { createSelector } from "@reduxjs/toolkit"
import { CATEGORIES_BY_FORMAT, VOTE_LIMIT } from "../constants"
import type { Category, Group, Idea, User } from "../types"
import type { RootState } from "./index"
import { groupsAdapter, ideasAdapter, usersAdapter, votesAdapter } from "./slices"

export const selectRetro = (state: RootState) => state.retro
export const selectStage = (state: RootState) => state.retro?.stage ?? null
export const selectAiStatus = (state: RootState) => state.retro?.ai_status ?? null
export const selectCurrentUserId = (state: RootState) => state.ui.currentUserId
export const selectConnected = (state: RootState) => state.ui.connected
export const selectToasts = (state: RootState) => state.ui.toasts
export const selectTimer = (state: RootState) => state.timer

export const { selectAll: selectAllIdeas, selectById: selectIdeaById } = ideasAdapter.getSelectors(
  (state: RootState) => state.ideas,
)
export const { selectAll: selectAllGroups, selectById: selectGroupById } = groupsAdapter.getSelectors(
  (state: RootState) => state.groups,
)
export const { selectAll: selectAllVotes } = votesAdapter.getSelectors((state: RootState) => state.votes)
export const { selectAll: selectAllUsers, selectEntities: selectUsersById } = usersAdapter.getSelectors(
  (state: RootState) => state.users,
)

export const selectCurrentUser = createSelector(
  [selectUsersById, selectCurrentUserId],
  (users, id): User | undefined => users[id],
)

export const selectIsFacilitator = createSelector(
  [selectRetro, selectCurrentUserId],
  (retro, id) => retro != null && retro.facilitator_id === id,
)

export const selectFacilitator = createSelector([selectRetro, selectUsersById], (retro, users) =>
  retro?.facilitator_id != null ? users[retro.facilitator_id] : undefined,
)

const NO_CATEGORIES: readonly Category[] = []

/** Idea-generation categories for the retro's format (excludes action items). */
export const selectCategories = createSelector(
  [(state: RootState) => state.retro?.format],
  (format): readonly Category[] => (format ? CATEGORIES_BY_FORMAT[format] : NO_CATEGORIES),
)

export const selectIdeasByCategory = createSelector([selectAllIdeas, selectCategories], (ideas, categories) => {
  const byCategory = {} as Record<Category, Idea[]>
  for (const category of categories) byCategory[category] = []
  for (const idea of ideas) byCategory[idea.category]?.push(idea)
  return byCategory
})

export const selectActionItems = createSelector([selectAllIdeas], (ideas) =>
  ideas.filter((idea) => idea.category === "action-item"),
)

export const selectMyVotes = createSelector([selectAllVotes, selectCurrentUserId], (votes, userId) =>
  votes.filter((vote) => vote.user_id === userId),
)

export const selectMyVotesLeft = createSelector([selectMyVotes], (votes) => Math.max(0, VOTE_LIMIT - votes.length))

/** user id -> number of votes cast. */
export const selectVoteCountsByUser = createSelector([selectAllVotes], (votes) => {
  const counts: Record<number, number> = {}
  for (const vote of votes) counts[vote.user_id] = (counts[vote.user_id] ?? 0) + 1
  return counts
})

export interface GroupWithIdeas extends Group {
  ideas: Idea[]
  voteCount: number
  myVoteCount: number
}

/** Groups that currently hold at least one (non action-item) idea, with their ideas and tallies. */
export const selectGroupsWithIdeas = createSelector(
  [selectAllGroups, selectAllIdeas, selectAllVotes, selectCurrentUserId],
  (groups, ideas, votes, userId): GroupWithIdeas[] => {
    const ideasByGroup = new Map<number, Idea[]>()
    for (const idea of ideas) {
      if (idea.group_id == null || idea.category === "action-item") continue
      const list = ideasByGroup.get(idea.group_id) ?? []
      list.push(idea)
      ideasByGroup.set(idea.group_id, list)
    }
    const voteCounts = new Map<number, number>()
    const myCounts = new Map<number, number>()
    for (const vote of votes) {
      voteCounts.set(vote.group_id, (voteCounts.get(vote.group_id) ?? 0) + 1)
      if (vote.user_id === userId) myCounts.set(vote.group_id, (myCounts.get(vote.group_id) ?? 0) + 1)
    }
    return groups
      .filter((group) => ideasByGroup.has(group.id))
      .map((group) => ({
        ...group,
        ideas: ideasByGroup.get(group.id)!,
        voteCount: voteCounts.get(group.id) ?? 0,
        myVoteCount: myCounts.get(group.id) ?? 0,
      }))
  },
)

/** Voting order: most ideas first, then oldest. Never by votes, so it's blind and the same for everyone. */
export const selectVotingGroups = createSelector([selectGroupsWithIdeas], (groups) =>
  [...groups].sort((a, b) => b.ideas.length - a.ideas.length || a.id - b.id),
)

/** Groups by total votes, most first (ties keep creation order). */
/**
 * Most votes first; ties go to bigger groups (so lone ideas sink below groups with
 * the same votes), then to the oldest group so the order is stable.
 */
export const selectRankedGroups = createSelector([selectGroupsWithIdeas], (groups) =>
  [...groups].sort((a, b) => b.voteCount - a.voteCount || b.ideas.length - a.ideas.length || a.id - b.id),
)

/** Display title: label, else the lone idea's body for singletons, else null. */
export function groupTitle(group: Pick<GroupWithIdeas, "label" | "ideas">): string | null {
  if (group.label) return group.label
  if (group.ideas.length === 1) return group.ideas[0].body
  return null
}

export const selectOnlineUserIds = createSelector([(state: RootState) => state.presence.onlineUserIds], (ids) => [
  ...new Set(ids),
])

/** Online participants; facilitator first, then alphabetical. */
export const selectPresentUsers = createSelector(
  [selectOnlineUserIds, selectUsersById, selectRetro],
  (ids, users, retro): User[] =>
    ids
      .map((id) => users[id])
      .filter((user): user is User => user != null)
      .sort((a, b) => {
        if (a.id === retro?.facilitator_id) return -1
        if (b.id === retro?.facilitator_id) return 1
        return a.name.localeCompare(b.name)
      }),
)

export interface Contributor {
  user: User
  online: boolean
}

/**
 * Everyone online plus anyone who left a mark on the retro (wrote an idea or action item, voted,
 * owns an action item, or facilitates it). Online first, then by name (id breaks ties). People
 * who only looked in and left are excluded.
 */
export const selectContributors = createSelector(
  [selectOnlineUserIds, selectUsersById, selectAllIdeas, selectAllVotes, selectRetro],
  (onlineIds, users, ideas, votes, retro): Contributor[] => {
    const online = new Set(onlineIds)
    const ids = new Set(onlineIds)
    for (const idea of ideas) {
      ids.add(idea.user_id)
      if (idea.assignee_id != null) ids.add(idea.assignee_id)
    }
    for (const vote of votes) ids.add(vote.user_id)
    if (retro?.facilitator_id != null) ids.add(retro.facilitator_id)
    return [...ids]
      .map((id) => users[id])
      .filter((user): user is User => user != null)
      .map((user) => ({ user, online: online.has(user.id) }))
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) || a.user.name.localeCompare(b.user.name) || a.user.id - b.user.id,
      )
  },
)

export const selectTypingUserIds = (state: RootState) => state.presence.typingUserIds

export const selectReactionsByUser = (state: RootState) => state.reactions.byUser
export const selectFloatingReactions = (state: RootState) => state.reactions.floating

/** True once every online participant has spent all their votes. */
/** Online participants who haven't used all their votes yet. */
export const selectVotersRemaining = createSelector(
  [selectOnlineUserIds, selectVoteCountsByUser],
  (ids, counts) => ids.filter((id) => (counts[id] ?? 0) < VOTE_LIMIT).length,
)

export const selectAllVotesIn = createSelector(
  [selectOnlineUserIds, selectVotersRemaining],
  (ids, remaining) => ids.length > 0 && remaining === 0,
)
