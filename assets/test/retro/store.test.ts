import { PushError } from "../../js/retro/channel"
import {
  groupTitle,
  selectAllVotesIn,
  selectGroupsWithIdeas,
  selectIdeasByCategory,
  selectIsFacilitator,
  selectMyVotesLeft,
  selectPresentUsers,
  selectRankedGroups,
  selectVotingGroups,
} from "../../js/retro/store/selectors"
import { ideaUpserted } from "../../js/retro/store/slices"
import {
  changeStage,
  createIdea,
  createVote,
  deleteIdea,
  deleteVote,
  retractVoteOnGroup,
  updateIdea,
} from "../../js/retro/store/thunks"
import { ada, group, idea, mockChannel, retro, setup, snapshot, vote } from "./helpers"

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("selectors", () => {
  const snap = snapshot({
    ideas: [
      idea({ id: 1, category: "happy", group_id: 10 }),
      idea({ id: 2, category: "sad", group_id: 10 }),
      idea({ id: 3, category: "confused", group_id: 11, body: "lonely" }),
      idea({ id: 4, category: "action-item", assignee_id: 2 }),
    ],
    groups: [group(10, "Deploys"), group(11), group(12)],
    votes: [vote(1, 1, 11), vote(2, 2, 11), vote(3, 1, 10)],
  })

  it("buckets ideas by format category, excluding action items", () => {
    const byCategory = selectIdeasByCategory(setup(snap).getState())
    expect(Object.keys(byCategory)).toEqual(["happy", "sad", "confused"])
    expect(byCategory.happy.map((i) => i.id)).toEqual([1])
  })

  it("builds groups with ideas and tallies, dropping empty groups", () => {
    const groups = selectGroupsWithIdeas(setup(snap).getState())
    expect(groups.map((g) => [g.id, g.ideas.length, g.voteCount, g.myVoteCount])).toEqual([
      [10, 2, 1, 1],
      [11, 1, 2, 1],
    ])
  })

  it("ranks groups by votes and titles singletons by their idea", () => {
    const ranked = selectRankedGroups(setup(snap).getState())
    expect(ranked.map((g) => g.id)).toEqual([11, 10])
    expect(groupTitle(ranked[0])).toBe("lonely")
    expect(groupTitle(ranked[1])).toBe("Deploys")
    expect(groupTitle({ label: null, ideas: [idea({ id: 9 }), idea({ id: 8 })] })).toBeNull()
  })

  it("breaks vote ties by group size, pushing lone ideas below groups", () => {
    const ideas = [
      idea({ id: 1, group_id: 20 }),
      idea({ id: 2, group_id: 21 }),
      idea({ id: 3, group_id: 21 }),
      idea({ id: 4, group_id: 21 }),
      idea({ id: 5, group_id: 22 }),
      idea({ id: 6, group_id: 22 }),
      idea({ id: 7, group_id: 23 }),
    ]
    const groups = [group(20), group(21, "Big"), group(22, "Pair"), group(23)]
    // 1 vote each, except the lone idea in group 23, which has 2.
    const votes = [vote(1, 1, 20), vote(2, 1, 21), vote(3, 1, 22), vote(4, 2, 23), vote(5, 2, 23)]
    const ranked = selectRankedGroups(setup(snapshot({ ideas, groups, votes })).getState())
    expect(ranked.map((g) => g.id)).toEqual([23, 21, 22, 20])
  })

  it("orders voting groups by size then age, ignoring votes, the same for everyone", () => {
    const ideas = [
      idea({ id: 1, group_id: 20 }),
      idea({ id: 2, group_id: 21 }),
      idea({ id: 3, group_id: 21 }),
      idea({ id: 4, group_id: 21 }),
      idea({ id: 5, group_id: 22 }),
      idea({ id: 6, group_id: 22 }),
      idea({ id: 7, group_id: 23 }),
      idea({ id: 8, group_id: 24 }),
      idea({ id: 9, group_id: 24 }),
      idea({ id: 10, group_id: 25, category: "action-item" }),
    ]
    // Out of id order; 23 is a labelled singleton; 25 holds only an action item.
    const groups = [group(24), group(23, "Lone"), group(22), group(21), group(20), group(25)]
    // Votes favour the singletons and differ per user; none of it may affect the order.
    const votes = [vote(1, 1, 20), vote(2, 1, 20), vote(3, 2, 23), vote(4, 2, 23), vote(5, 2, 24)]
    const s = snapshot({ ideas, groups, votes })
    const order = (userId: number) => selectVotingGroups(setup(s, { userId }).getState()).map((g) => g.id)
    expect(order(1)).toEqual([21, 22, 24, 20, 23])
    expect(order(2)).toEqual(order(1))
    // Later stages still rank by votes.
    expect(selectRankedGroups(setup(s).getState()).map((g) => g.id)).toEqual([20, 23, 24, 21, 22])
  })

  it("keeps optimistic ideas at the end, in creation order", () => {
    const store = setup(snapshot({ ideas: [idea({ id: 5 }), idea({ id: 9 })] }))
    store.dispatch(ideaUpserted(idea({ id: -1, body: "first draft" })))
    store.dispatch(ideaUpserted(idea({ id: -2, body: "second draft" })))
    expect(store.getState().ideas.ids).toEqual([5, 9, -1, -2])
  })

  it("is memoised", () => {
    const state = setup(snap).getState()
    expect(selectGroupsWithIdeas(state)).toBe(selectGroupsWithIdeas(state))
  })

  it("computes votes left and all-votes-in for present users", () => {
    const state = setup(snapshot({ votes: [vote(1, 1, 1), vote(2, 1, 1), vote(3, 1, 2)] }), { online: [1] }).getState()
    expect(selectMyVotesLeft(state)).toBe(0)
    expect(selectAllVotesIn(state)).toBe(true)
    const both = setup(snapshot({ votes: [vote(1, 1, 1), vote(2, 1, 1), vote(3, 1, 2)] })).getState()
    expect(selectAllVotesIn(both)).toBe(false)
  })

  it("lists present users facilitator first and knows who facilitates", () => {
    const store = setup(snapshot({ retro: retro({ facilitator_id: 2 }) }))
    expect(selectPresentUsers(store.getState()).map((u) => u.id)).toEqual([2, 1])
    expect(selectIsFacilitator(store.getState())).toBe(false)
  })
})

describe("idea thunks", () => {
  it("adds an optimistic idea then swaps in the persisted one", async () => {
    const reply = deferred<unknown>()
    const { channel, push } = mockChannel(() => reply.promise)
    const store = setup(snapshot(), { channel })

    const pending = store.dispatch(createIdea({ category: "happy", body: "Shipped!" }))
    const optimistic = Object.values(store.getState().ideas.entities)
    expect(optimistic).toHaveLength(1)
    expect(optimistic[0]).toMatchObject({ body: "Shipped!", user_id: ada.id })
    expect(optimistic[0]!.id).toBeLessThan(0)
    expect(push).toHaveBeenCalledWith("idea:create", { category: "happy", body: "Shipped!" })

    reply.resolve({ idea: idea({ id: 42, body: "Shipped!" }) })
    await pending
    expect(store.getState().ideas.ids).toEqual([42])
  })

  it("removes the optimistic idea and toasts on error", async () => {
    const { channel } = mockChannel(() => Promise.reject(new PushError("invalid_stage")))
    const store = setup(snapshot(), { channel })
    const result = await store.dispatch(createIdea({ category: "happy", body: "late" }))
    expect(result.payload).toBe("invalid_stage")
    expect(store.getState().ideas.ids).toEqual([])
    expect(store.getState().ui.toasts[0].message).toMatch(/current stage/)
  })

  it("rolls back a failed edit and a failed delete", async () => {
    const { channel } = mockChannel(() => Promise.reject(new PushError("forbidden")))
    const store = setup(snapshot({ ideas: [idea({ id: 5, body: "original" })] }), { channel })
    await store.dispatch(updateIdea({ id: 5, body: "changed" }))
    expect(store.getState().ideas.entities[5]?.body).toBe("original")
    await store.dispatch(deleteIdea(5))
    expect(store.getState().ideas.entities[5]).toBeDefined()
    expect(store.getState().ui.toasts).toHaveLength(2)
  })
})

describe("vote thunks", () => {
  it("optimistically adds a vote and replaces it with the server's", async () => {
    const reply = deferred<unknown>()
    const { channel, push } = mockChannel(() => reply.promise)
    const store = setup(snapshot({ groups: [group(10)] }), { channel })
    const pending = store.dispatch(createVote(10))
    expect(selectMyVotesLeft(store.getState())).toBe(2)
    expect(push).toHaveBeenCalledWith("vote:create", { group_id: 10 })
    reply.resolve({ vote: vote(77, 1, 10) })
    await pending
    expect(store.getState().votes.ids).toEqual([77])
  })

  it("rolls back a rejected vote", async () => {
    const { channel } = mockChannel(() => Promise.reject(new PushError("vote_limit")))
    const store = setup(snapshot(), { channel })
    await store.dispatch(createVote(10))
    expect(store.getState().votes.ids).toEqual([])
    expect(store.getState().ui.toasts).toHaveLength(1)
  })

  it("does not push when out of votes", async () => {
    const { channel, push } = mockChannel()
    const store = setup(snapshot({ votes: [vote(1, 1, 10), vote(2, 1, 10), vote(3, 1, 10)] }), { channel })
    const result = await store.dispatch(createVote(10))
    expect(result.payload).toBe("vote_limit")
    expect(push).not.toHaveBeenCalled()
  })

  it("restores a vote when retraction fails", async () => {
    const { channel } = mockChannel(() => Promise.reject(new PushError("timeout")))
    const store = setup(snapshot({ votes: [vote(1, 1, 10)] }), { channel })
    await store.dispatch(deleteVote(1))
    expect(store.getState().votes.ids).toEqual([1])
  })

  it("retracts the current user's latest vote on a group", async () => {
    const { channel, push } = mockChannel()
    const store = setup(snapshot({ votes: [vote(1, 1, 10), vote(2, 1, 10), vote(3, 2, 10)] }), { channel })
    await store.dispatch(retractVoteOnGroup(10))
    expect(push).toHaveBeenCalledWith("vote:delete", { id: 2 })
    expect(store.getState().votes.ids).toEqual([1, 3])
  })
})

describe("stage thunk", () => {
  it("pushes the target stage", async () => {
    const { channel, push } = mockChannel()
    const store = setup(snapshot(), { channel })
    await store.dispatch(changeStage("grouping"))
    expect(push).toHaveBeenCalledWith("retro:stage", { stage: "grouping" })
  })
})
