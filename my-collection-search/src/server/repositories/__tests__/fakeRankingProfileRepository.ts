/** An in-memory `RankingProfileRepository` with the database's rules, for service and route tests. */
import type { RankingSurface } from "@groovenet/contracts";
import type {
  RankingProfileRepository,
  RankingProfileRow,
  RankingProfileWrite,
  RankingSelection,
  RankingSelectionRow,
} from "../rankingProfileRepository";

export class FakeRankingProfileRepository implements Pick<
  RankingProfileRepository,
  keyof RankingProfileRepository
> {
  rows: RankingProfileRow[] = [];
  selections: Array<RankingSelectionRow & { friend_id: number }> = [];
  friends = new Set([1, 2]);
  private nextId = 1;

  reset() {
    this.rows = [];
    this.selections = [];
    this.nextId = 1;
  }

  private missingFriend(friendId: number) {
    if (!this.friends.has(friendId)) {
      throw Object.assign(new Error("violates foreign key constraint"), { code: "23503" });
    }
  }

  async listByFriend(friendId: number) {
    return this.rows.filter((row) => row.friend_id === friendId);
  }

  async findById(id: number) {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async insert(friendId: number, profile: RankingProfileWrite, limit: number) {
    this.missingFriend(friendId);
    if ((await this.listByFriend(friendId)).length >= limit) return null;
    const row = { id: this.nextId++, friend_id: friendId, ...profile };
    this.rows.push(JSON.parse(JSON.stringify(row)));
    return row;
  }

  async update(id: number, profile: RankingProfileWrite) {
    const row = await this.findById(id);
    if (!row) return null;
    Object.assign(row, JSON.parse(JSON.stringify(profile)));
    return row;
  }

  async dropSelectionsOutside(profileId: number, surfaces: RankingSurface[]) {
    this.selections = this.selections.filter(
      (s) => s.profile_id !== profileId || surfaces.includes(s.surface as RankingSurface),
    );
  }

  async delete(id: number) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== id);
    this.selections = this.selections.filter((s) => s.profile_id !== id);
    return this.rows.length < before;
  }

  async listSelections(friendId: number) {
    return this.selections
      .filter((s) => s.friend_id === friendId)
      .map(({ surface, preset_id, profile_id }) => ({ surface, preset_id, profile_id }));
  }

  async setSelections(friendId: number, surfaces: RankingSurface[], selection: RankingSelection) {
    this.missingFriend(friendId);
    for (const surface of surfaces) {
      this.selections = this.selections.filter(
        (s) => !(s.friend_id === friendId && s.surface === surface),
      );
      this.selections.push({
        friend_id: friendId,
        surface,
        preset_id: "presetId" in selection ? selection.presetId : null,
        profile_id: "profileId" in selection ? selection.profileId : null,
      });
    }
  }
}
