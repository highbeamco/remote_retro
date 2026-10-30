defmodule RemoteRetro.Repo.IAMAuthTest do
  use ExUnit.Case, async: true
  import ExUnit.CaptureLog
  alias RemoteRetro.AI.Credentials
  alias RemoteRetro.Repo.IAMAuth

  test "is off outside prod IAM config, so no token source starts" do
    refute IAMAuth.enabled?()
    assert IAMAuth.children() == []
  end

  test "leaves opts untouched when a password is present" do
    opts = [username: "postgres", password: "postgres", database: "remote_retro"]
    assert IAMAuth.configure(opts, fn -> flunk("fetched a token") end) == opts
  end

  test "sets the password to a fresh token when there is none" do
    opts = [username: "sa@project.iam", database: "remote_retro"]
    configured = IAMAuth.configure(opts, fn -> {:ok, "ya29.token"} end)

    assert configured[:password] == "ya29.token"
    assert Keyword.delete(configured, :password) == opts
  end

  test "logs why, and sets an empty password, when no token can be fetched" do
    opts = [username: "sa@project.iam"]

    log =
      capture_log(fn ->
        assert IAMAuth.configure(opts, fn -> {:error, :timeout} end) == [password: ""] ++ opts
      end)

    assert log =~ "Cloud SQL IAM auth: could not fetch an access token: :timeout"
  end

  test "logs why, and sets an empty password, when the token source isn't running" do
    opts = [username: "sa@project.iam"]

    # The shared Goth may be running here (AI is on when GCP_PROJECT is set), so
    # fetch from one that never starts.
    log =
      capture_log(fn ->
        assert IAMAuth.configure(opts, fn -> Credentials.token(__MODULE__.Goth) end) ==
                 [password: ""] ++ opts
      end)

    assert log =~ "could not fetch an access token: {:goth_unavailable"
  end

  test "Postgrex connects with the password the hook supplies" do
    repo = RemoteRetro.Repo.config()
    test = self()

    fetch_token = fn ->
      send(test, :fetched)
      {:ok, repo[:password]}
    end

    conn =
      start_supervised!(
        {Postgrex,
         Keyword.take(repo, [:hostname, :port, :username, :database]) ++
           [password: nil, configure: {IAMAuth, :configure, [fetch_token]}]}
      )

    assert %Postgrex.Result{rows: [[1]]} = Postgrex.query!(conn, "SELECT 1", [])
    assert_received :fetched
  end
end
