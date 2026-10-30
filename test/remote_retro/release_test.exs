defmodule RemoteRetro.ReleaseTest do
  use ExUnit.Case, async: true
  alias RemoteRetro.Release

  # Stands in for the shared Goth's child spec (named, `id: name`) without fetching tokens.
  defp goth(name), do: Supervisor.child_spec({Task.Supervisor, name: name}, id: name)

  test "starting IAM auth again is a no-op, wherever the token source is running" do
    # Twice in one VM, e.g. a chained `eval` of rollback then migrate
    assert Release.start_iam_auth([goth(__MODULE__.Goth)]) == :ok
    assert Release.start_iam_auth([goth(__MODULE__.Goth)]) == :ok

    # Already started outside it, e.g. `rpc` into a node whose app runs the shared Goth
    start_supervised!(goth(__MODULE__.AppGoth))
    assert Release.start_iam_auth([goth(__MODULE__.AppGoth)]) == :ok
  end
end
