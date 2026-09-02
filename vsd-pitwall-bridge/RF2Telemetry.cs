using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;

namespace VsdPitwallBridge;

// ---------------------------------------------------------------------------
// Buffer Telemetry ($rFactor2SMMP_Telemetry$) — SEPARATO dal buffer Scoring
// già letto in RF2Scoring.cs. Contiene gomme/carburante/danni/motore per
// vettura, ma è affidabile SOLO per la vettura del giocatore locale (quella
// di chi lancia il bridge) — per le altre vetture della griglia il gioco non
// garantisce dati aggiornati/corretti (limite noto rF2/LMU, non un bug
// nostro). Per questo BuildPayload in Program.cs seleziona solo l'entry con
// mID uguale al player nello Scoring buffer, non l'intero array.
//
// Stessa fonte di RF2Scoring.cs (struct copiati/adattati, stesso Pack=4 e
// marshaling): github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin
//        Monitor/rF2SMMonitor/rF2SMMonitor/rF2Data.cs
//
// rF2Wheel/rF2VehicleTelemetry qui sotto includono OGNI campo dello struct
// originale, anche quelli non ancora usati in Program.cs: il marshaling con
// Marshal.PtrToStructure richiede il layout completo e nell'ordine esatto,
// non si può "saltare" un campo intermedio — stesso vincolo già rispettato
// in RF2Scoring.cs. mVec3 riusa il tipo RF2Vec3 già definito lì (stesso
// namespace): niente doppione.
//
// mTemperature[3] delle gomme: il commento originale del plugin dice
// "left/center/right (not to be confused with inside/center/outside!)" —
// cioè NON è garantito che indice 0 sia il lato interno della gomma (dipende
// da quale lato dell'auto). Teniamo i nomi fedeli alla fonte (Left/Center/
// Right) invece di inventare un mapping interno/esterno non confermato.
// ---------------------------------------------------------------------------

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
public struct RF2Wheel
{
    public double mSuspensionDeflection;
    public double mRideHeight;
    public double mSuspForce;
    public double mBrakeTemp;             // Celsius
    public double mBrakePressure;

    public double mRotation;
    public double mLateralPatchVel;
    public double mLongitudinalPatchVel;
    public double mLateralGroundVel;
    public double mLongitudinalGroundVel;
    public double mCamber;
    public double mLateralForce;
    public double mLongitudinalForce;
    public double mTireLoad;

    public double mGripFract;
    public double mPressure;              // kPa

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public double[] mTemperature;         // Kelvin, left/center/right — vedi nota in testa al file

    public double mWear;                  // 0.0-1.0, frazione del massimo (non proporzionale alla perdita di grip)

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
    public byte[] mTerrainName;
    public byte mSurfaceType;
    public byte mFlat;
    public byte mDetached;
    public byte mStaticUndeflectedRadius;

    public double mVerticalTireDeflection;
    public double mWheelYLocation;
    public double mToe;

    public double mTireCarcassTemperature;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public double[] mTireInnerLayerTemperature;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 24)]
    public byte[] mExpansion;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
public struct RF2VehicleTelemetry
{
    public int mID;
    public double mDeltaTime;
    public double mElapsedTime;
    public int mLapNumber;
    public double mLapStartET;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] mVehicleName;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
    public byte[] mTrackName;

    public RF2Vec3 mPos;
    public RF2Vec3 mLocalVel;
    public RF2Vec3 mLocalAccel;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public RF2Vec3[] mOri;
    public RF2Vec3 mLocalRot;
    public RF2Vec3 mLocalRotAccel;

    public int mGear;
    public double mEngineRPM;
    public double mEngineWaterTemp;       // Celsius
    public double mEngineOilTemp;         // Celsius
    public double mClutchRPM;

    public double mUnfilteredThrottle;
    public double mUnfilteredBrake;
    public double mUnfilteredSteering;
    public double mUnfilteredClutch;

    public double mFilteredThrottle;
    public double mFilteredBrake;
    public double mFilteredSteering;
    public double mFilteredClutch;

    public double mSteeringShaftTorque;
    public double mFront3rdDeflection;
    public double mRear3rdDeflection;

    public double mFrontWingHeight;
    public double mFrontRideHeight;
    public double mRearRideHeight;
    public double mDrag;
    public double mFrontDownforce;
    public double mRearDownforce;

    public double mFuel;                  // litri
    public double mEngineMaxRPM;
    public byte mScheduledStops;
    public byte mOverheating;
    public byte mDetached;
    public byte mHeadlights;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
    public byte[] mDentSeverity;
    public double mLastImpactET;
    public double mLastImpactMagnitude;
    public RF2Vec3 mLastImpactPos;

    public double mEngineTorque;
    public int mCurrentSector;
    public byte mSpeedLimiter;
    public byte mMaxGears;
    public byte mFrontTireCompoundIndex;
    public byte mRearTireCompoundIndex;
    public double mFuelCapacity;          // litri
    public byte mFrontFlapActivated;
    public byte mRearFlapActivated;
    public byte mRearFlapLegalStatus;
    public byte mIgnitionStarter;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 18)]
    public byte[] mFrontTireCompoundName;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 18)]
    public byte[] mRearTireCompoundName;

    public byte mSpeedLimiterAvailable;
    public byte mAntiStallActivated;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 2)]
    public byte[] mUnused;
    public float mVisualSteeringWheelRange;

    public double mRearBrakeBias;
    public double mTurboBoostPressure;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
    public float[] mPhysicsToGraphicsOffset;
    public float mPhysicalSteeringWheelRange;

    public double mBatteryChargeFraction;

    public double mElectricBoostMotorTorque;
    public double mElectricBoostMotorRPM;
    public double mElectricBoostMotorTemperature;
    public double mElectricBoostWaterTemperature;
    public byte mElectricBoostMotorState;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 111)]
    public byte[] mExpansion;

    // Va tenuto in fondo allo struct (stesso ordine della fonte originale).
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
    public RF2Wheel[] mWheels;            // ordine: FL, FR, RL, RR
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
public struct RF2Telemetry
{
    public uint mVersionUpdateBegin;
    public uint mVersionUpdateEnd;
    public int mBytesUpdatedHint;

    public int mNumVehicles;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = RFactor2Constants.MAX_MAPPED_VEHICLES)]
    public RF2VehicleTelemetry[] mVehicles;
}

/// <summary>
/// Apre "$rFactor2SMMP_Telemetry$" in sola lettura — stesso pattern di
/// RF2ScoringReader. Se il buffer non esiste ancora (plugin non abilitato,
/// o gioco non ancora entrato in sessione) TryOpen ritorna false e il
/// chiamante tratta la telemetria come assente per quel tick, senza
/// bloccare il resto del bridge (lo Scoring buffer resta la fonte primaria
/// per classifica/gap/settori).
/// </summary>
public sealed class RF2TelemetryReader : IDisposable
{
    private MemoryMappedFile? _mmf;
    private readonly int _structSize = Marshal.SizeOf<RF2Telemetry>();

    public bool TryOpen()
    {
        try
        {
            _mmf = MemoryMappedFile.OpenExisting(
                RFactor2Constants.MM_TELEMETRY_FILE_NAME,
                MemoryMappedFileRights.Read);
            return true;
        }
        catch (FileNotFoundException)
        {
            _mmf = null;
            return false;
        }
    }

    public RF2Telemetry? ReadOnce()
    {
        if (_mmf is null) return null;

        using var accessor = _mmf.CreateViewAccessor(0, _structSize, MemoryMappedFileAccess.Read);

        var buffer = new byte[_structSize];
        accessor.ReadArray(0, buffer, 0, buffer.Length);

        var handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        try
        {
            return Marshal.PtrToStructure<RF2Telemetry>(handle.AddrOfPinnedObject());
        }
        finally
        {
            handle.Free();
        }
    }

    public void Dispose() => _mmf?.Dispose();
}
