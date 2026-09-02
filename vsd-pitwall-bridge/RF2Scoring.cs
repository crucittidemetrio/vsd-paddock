using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;

namespace VsdPitwallBridge;

// ---------------------------------------------------------------------------
// Struct copiati/adattati da rF2Data.cs, il file C# che il plugin
// TheIronWolfModding/rF2SharedMemoryMapPlugin mantiene manualmente sincronizzato
// con il vero header C++ (Include/rF2State.h). Non e' un'approssimazione: e'
// la fonte usata anche da TinyPedal, RacePulse, ecc.
// Fonte: github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin
//        Monitor/rF2SMMonitor/rF2SMMonitor/rF2Data.cs
//
// Se in futuro il plugin/l'API di LMU aggiunge campi, finiscono dentro gli
// array mExpansion/mUnused riservati per compatibilita' futura — il layout
// esistente non si rompe. Non serve verificarlo a mano.
// ---------------------------------------------------------------------------

public static class RFactor2Constants
{
    public const string MM_SCORING_FILE_NAME = "$rFactor2SMMP_Scoring$";
    public const string MM_TELEMETRY_FILE_NAME = "$rFactor2SMMP_Telemetry$"; // vedi RF2Telemetry.cs
    public const int MAX_MAPPED_VEHICLES = 128;
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct RF2Vec3
{
    public double x, y, z;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
public struct RF2ScoringInfo
{
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] mTrackName;

    public int mSession;
    public double mCurrentET;
    public double mEndET;
    public int mMaxLaps;
    public double mLapDist;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
    public byte[] pointer1;

    public int mNumVehicles;
    public byte mGamePhase;
    public sbyte mYellowFlagState;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public sbyte[] mSectorFlag;

    public byte mStartLight;
    public byte mNumRedLights;
    public byte mInRealtime;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] mPlayerName;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] mPlrFileName;

    public double mDarkCloud;
    public double mRaining;
    public double mAmbientTemp;
    public double mTrackTemp;
    public RF2Vec3 mWind;
    public double mMinPathWetness;
    public double mMaxPathWetness;

    public byte mGameMode;
    public byte mIsPasswordProtected;
    public ushort mServerPort;
    public uint mServerPublicIP;
    public int mMaxPlayers;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] mServerName;

    public float mStartET;
    public double mAvgPathWetness;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 200)]
    public byte[] mExpansion;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
    public byte[] pointer2;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
public struct RF2VehicleScoring
{
    public int mID;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] mDriverName;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] mVehicleName;

    public short mTotalLaps;
    public sbyte mSector;         // 0=sector3, 1=sector1, 2=sector2 (cosi' nell'originale)
    public sbyte mFinishStatus;   // 0=none, 1=finished, 2=dnf, 3=dq

    public double mLapDist;
    public double mPathLateral;
    public double mTrackEdge;

    public double mBestSector1;
    public double mBestSector2;
    public double mBestLapTime;
    public double mLastSector1;
    public double mLastSector2;
    public double mLastLapTime;
    public double mCurSector1;
    public double mCurSector2;

    public short mNumPitstops;
    public short mNumPenalties;
    public byte mIsPlayer;
    public sbyte mControl;        // -1 nessuno, 0 player locale, 1 AI, 2 remoto, 3 replay
    public byte mInPits;
    public byte mPlace;           // posizione 1-based

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
    public byte[] mVehicleClass;

    public double mTimeBehindNext;
    public int mLapsBehindNext;
    public double mTimeBehindLeader;
    public int mLapsBehindLeader;
    public double mLapStartET;

    public RF2Vec3 mPos;
    public RF2Vec3 mLocalVel;
    public RF2Vec3 mLocalAccel;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public RF2Vec3[] mOri;

    public RF2Vec3 mLocalRot;
    public RF2Vec3 mLocalRotAccel;

    public byte mHeadlights;
    public byte mPitState;        // 0=none,1=request,2=entering,3=stopped,4=exiting — valori 0-4
                                   // da fonte non verificata; test reale (Algarve, pratica, 01/09/2026)
                                   // mostra costantemente anche il valore 5 su auto sia in pista che
                                   // ai box: l'enum documentato è incompleto/impreciso. Nessun problema
                                   // funzionale (il valore grezzo viene solo passato al client, mai
                                   // interpretato lato bridge) — non fidarsi del significato esatto di
                                   // pitState finché non si trova la fonte ufficiale del valore 5.
    public byte mServerScored;
    public byte mIndividualPhase;
    public int mQualification;
    public double mTimeIntoLap;
    public double mEstimatedLapTime;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 24)]
    public byte[] mPitGroup;

    public byte mFlag;
    public byte mUnderYellow;
    public byte mCountLapFlag;
    public byte mInGarageStall;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
    public byte[] mUpgradePack;

    public float mPitLapDist;
    public float mBestLapSector1;
    public float mBestLapSector2;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 48)]
    public byte[] mExpansion;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
public struct RF2Scoring
{
    public uint mVersionUpdateBegin;
    public uint mVersionUpdateEnd;
    public int mBytesUpdatedHint;

    public RF2ScoringInfo mScoringInfo;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = RFactor2Constants.MAX_MAPPED_VEHICLES)]
    public RF2VehicleScoring[] mVehicles;
}

/// <summary>
/// Apre "$rFactor2SMMP_Scoring$" in sola lettura e marshalla l'intero blocco
/// in un colpo solo con Marshal.PtrToStructure (stesso pattern usato dal
/// Monitor ufficiale del plugin: copia i byte grezzi su memoria pinnata,
/// poi marshalla). Nessuna scrittura verso il gioco.
/// </summary>
public sealed class RF2ScoringReader : IDisposable
{
    private MemoryMappedFile? _mmf;
    private readonly int _structSize = Marshal.SizeOf<RF2Scoring>();

    public bool TryOpen()
    {
        try
        {
            _mmf = MemoryMappedFile.OpenExisting(
                RFactor2Constants.MM_SCORING_FILE_NAME,
                MemoryMappedFileRights.Read);
            return true;
        }
        catch (FileNotFoundException)
        {
            // Gioco non avviato, o plugin/API non abilitato
            // (LMU: Settings > Gameplay > Enable Plugins).
            _mmf = null;
            return false;
        }
    }

    public RF2Scoring? ReadOnce()
    {
        if (_mmf is null) return null;

        using var accessor = _mmf.CreateViewAccessor(0, _structSize, MemoryMappedFileAccess.Read);

        var buffer = new byte[_structSize];
        accessor.ReadArray(0, buffer, 0, buffer.Length);

        var handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        try
        {
            return Marshal.PtrToStructure<RF2Scoring>(handle.AddrOfPinnedObject());
        }
        finally
        {
            handle.Free();
        }
    }

    public void Dispose() => _mmf?.Dispose();
}

/// <summary>Converte un array di byte a lunghezza fissa (stringa C ANSI) in string .NET, senza padding \0.</summary>
public static class RF2StringHelper
{
    public static string ToTrimmedString(byte[]? raw)
    {
        if (raw is null) return string.Empty;
        int len = Array.IndexOf(raw, (byte)0);
        if (len < 0) len = raw.Length;
        return System.Text.Encoding.ASCII.GetString(raw, 0, len).Trim();
    }
}
