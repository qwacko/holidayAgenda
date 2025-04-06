// js/script.js - Refactored for Alpine.js

// --- Date Utilities ---
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  // YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
  // YYYY-MM-DD
  if (!dateString) return null;
  const parts = dateString.split("-");
  // Note: Month is 0-indexed in JS Date constructor
  try {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(date.getTime())) {
      console.warn("Invalid date string parsed:", dateString);
      return null;
    }
    return date;
  } catch (e) {
    console.error("Error parsing date:", dateString, e);
    return null;
  }
}

function getDayName(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    console.warn("Invalid date passed to getDayName:", date);
    return "Invalid Date";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// --- Helper function to format location details ---
function formatLocation(location) {
  if (!location) return "";
  let locationText = location.name || "";
  if (location.address) locationText += `, ${location.address}`;
  if (location.country) locationText += `, ${location.country}`;
  if (location.details) locationText += ` (${location.details})`;
  // Keep newlines for potential pre-wrap styling, but remove leading space after newline
  return locationText.replace(/\n\s*/g, "\n");
}

// --- Helper to determine if an activity is generic exploration ---
function isGenericExploreActivity(description, dayLocationTitle) {
  if (!description || !dayLocationTitle) return false;
  const cleanedDesc = description
    .replace(/^Explore\s+/i, "")
    .replace(/\s+Area$/i, "")
    .trim();
  const cleanedTitle = dayLocationTitle.replace(/\s+Area$/i, "").trim();
  return cleanedDesc.toLowerCase() === cleanedTitle.toLowerCase();
}

// --- Main function to load and process data for Alpine ---
async function loadTripData() {
  try {
    const response = await fetch("data/travel.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // --- Data Lookups ---
    const locations = data.locations || {};
    const accommodations = data.accommodations || [];
    const cruises = data.cruises || [];
    const events = data.events || [];
    const weeks = data.weeks || [];

    // --- Parse overall trip dates ---
    const { tripStartDate, tripEndDate, tripStartDateUTC, tripEndDateUTC } =
      parseTripDates(data.tripDates);
    if (!tripStartDate || !tripEndDate) {
      throw new Error("Could not parse trip start/end dates.");
    }

    // --- Group data by date ---
    const itineraryByDate = groupItineraryByDate(
      tripStartDate,
      tripEndDate,
      accommodations,
      cruises,
      events
    );

    // --- Calculate daily status ---
    const dailyInfoByDate = calculateDailyInfo(
      tripStartDate,
      tripEndDate,
      itineraryByDate,
      locations,
      accommodations,
      cruises
    );

    // --- Structure data for Alpine ---
    const processedWeeks = structureDataForAlpine(
      tripStartDate,
      tripEndDate,
      weeks,
      itineraryByDate,
      dailyInfoByDate,
      locations
    );

    return {
      tripTitle: data.tripTitle || "Trip Agenda",
      tripDates: data.tripDates || "Unknown Dates",
      tripStartDateUTC: tripStartDateUTC,
      tripEndDateUTC: tripEndDateUTC,
      weeks: processedWeeks,
      locations: locations, // Pass locations for potential lookups in Alpine if needed
      loading: false,
      error: null,
      todayDateString: formatDate(new Date()), // For highlighting today
      // Add UI state properties
      openWeekIds: processedWeeks.map((w) => w.id), // Start with all weeks open
      openDayIds: processedWeeks.flatMap((w) => w.days.map((d) => d.dateStr)), // Start with all days open
      nowUTC: Date.now(), // For progress calculation
    };
  } catch (error) {
    console.error("Error loading or processing trip data:", error);
    return {
      tripTitle: "Error Loading Trip",
      tripDates: "",
      weeks: [],
      locations: {},
      loading: false,
      error: `Failed to load itinerary: ${error.message}`,
      tripStartDateUTC: null,
      tripEndDateUTC: null,
      todayDateString: formatDate(new Date()),
      openWeekIds: [],
      openDayIds: [],
      nowUTC: Date.now(),
    };
  }
}

// --- Data Processing Functions ---

function parseTripDates(tripDatesString) {
  // Parses "Month Day - Month Day, Year" format
  try {
    const dateParts = tripDatesString.split(" - ");
    const startDateStr = dateParts[0];
    const endDateStr = dateParts[1];
    const year = parseInt(endDateStr.split(", ")[1], 10);

    const months = {
      January: 0,
      February: 1,
      March: 2,
      April: 3,
      May: 4,
      June: 5,
      July: 6,
      August: 7,
      September: 8,
      October: 9,
      November: 10,
      December: 11,
    };

    const startMonthName = startDateStr.split(" ")[0];
    const startDay = parseInt(startDateStr.split(" ")[1], 10);
    const startMonth = months[startMonthName];

    const endMonthName = endDateStr.split(" ")[0];
    const endDay = parseInt(endDateStr.split(",")[0].split(" ")[1], 10);
    const endMonth = months[endMonthName];

    if (
      isNaN(year) ||
      startMonth === undefined ||
      isNaN(startDay) ||
      endMonth === undefined ||
      isNaN(endDay)
    ) {
      throw new Error("Could not parse date components.");
    }

    const tripStartDate = new Date(year, startMonth, startDay);
    const tripEndDate = new Date(year, endMonth, endDay);

    if (isNaN(tripStartDate.getTime()) || isNaN(tripEndDate.getTime())) {
      throw new Error("Parsed dates resulted in Invalid Date.");
    }

    // Store UTC versions for progress calculation (use noon to avoid timezone issues at midnight)
    const tripStartDateUTC = Date.UTC(year, startMonth, startDay, 12, 0, 0);
    const tripEndDateUTC = Date.UTC(year, endMonth, endDay, 12, 0, 0);

    return { tripStartDate, tripEndDate, tripStartDateUTC, tripEndDateUTC };
  } catch (e) {
    console.error("Error parsing trip dates string:", tripDatesString, e);
    return {
      tripStartDate: null,
      tripEndDate: null,
      tripStartDateUTC: null,
      tripEndDateUTC: null,
    };
  }
}

function groupItineraryByDate(
  startDate,
  endDate,
  accommodations,
  cruises,
  events
) {
  const itineraryByDate = {};
  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const dateStr = formatDate(d);
    itineraryByDate[dateStr] = [];
  }

  // Process Accommodations
  accommodations.forEach((acc) => {
    const start = parseDate(acc.startDate);
    const end = parseDate(acc.endDate);
    if (!start || !end) return;
    const checkInDateStr = formatDate(start);
    const checkOutDateStr = formatDate(end);
    if (itineraryByDate[checkInDateStr]) {
      itineraryByDate[checkInDateStr].push({
        ...acc,
        eventType: "accommodation-check-in",
      });
    }
    if (itineraryByDate[checkOutDateStr]) {
      itineraryByDate[checkOutDateStr].push({
        ...acc,
        eventType: "accommodation-check-out",
      });
    }
  });

  // Process Cruises
  cruises.forEach((cruise) => {
    const start = parseDate(cruise.startDate);
    const end = parseDate(cruise.endDate);
    if (!start || !end) return;
    const embarkDateStr = formatDate(start);
    const disembarkDateStr = formatDate(end);
    if (itineraryByDate[embarkDateStr]) {
      itineraryByDate[embarkDateStr].push({
        ...cruise,
        eventType: "cruise-embark",
      });
    }
    if (itineraryByDate[disembarkDateStr]) {
      itineraryByDate[disembarkDateStr].push({
        ...cruise,
        eventType: "cruise-disembark",
      });
    }
    // Port Calls & Sea Days
    let currentDate = addDays(start, 1);
    const endDateCruise = new Date(end);
    while (currentDate < endDateCruise) {
      const currentDateStr = formatDate(currentDate);
      if (itineraryByDate[currentDateStr]) {
        const portCall = (cruise.portCalls || []).find(
          (pc) => pc.date === currentDateStr
        );
        if (portCall) {
          itineraryByDate[currentDateStr].push({
            ...cruise,
            ...portCall,
            eventType: "cruise-port-call",
          });
        } else {
          itineraryByDate[currentDateStr].push({
            ...cruise,
            eventType: "cruise-sea-day",
          });
        }
      }
      currentDate = addDays(currentDate, 1);
    }
  });

  // Process Events
  events.forEach((event) => {
    if (event.date) {
      // Single day event
      const dateStr = event.date;
      if (itineraryByDate[dateStr]) {
        itineraryByDate[dateStr].push({ ...event, eventType: event.type });
      }
    } else if (event.startDate && event.endDate) {
      // Multi-day event
      let current = parseDate(event.startDate);
      const end = parseDate(event.endDate);
      if (!current || !end) return;
      while (current <= end) {
        const dateStr = formatDate(current);
        if (itineraryByDate[dateStr]) {
          let multiDayStatus =
            formatDate(current) === event.startDate
              ? " (Start)"
              : formatDate(current) === event.endDate
              ? " (End)"
              : "";
          itineraryByDate[dateStr].push({
            ...event,
            eventType: event.type,
            multiDayDescription: `${event.description}${multiDayStatus}`,
          });
        }
        current = addDays(current, 1);
      }
    }
  });

  return itineraryByDate;
}

function calculateDailyInfo(
  startDate,
  endDate,
  itineraryByDate,
  locations,
  accommodations,
  cruises
) {
  const dailyInfoByDate = {};
  let currentAccommodation = null;
  let currentCruise = null;

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const dateStr = formatDate(d);
    const dayItems = itineraryByDate[dateStr] || [];

    let dayTitle = "Location Unknown";
    let stayingAt = null;
    let onCruise = null;
    let isTravelDay = false;
    let isCruiseDay = false;

    // --- Determine Status Logic (Simplified from original, focusing on state for the day) ---

    // 1. Check for Check-out / Cruise Disembark (Affects *previous* day's state, but flags today)
    const checkOut = dayItems.find(
      (item) => item.eventType === "accommodation-check-out"
    );
    const cruiseDisembark = dayItems.find(
      (item) => item.eventType === "cruise-disembark"
    );
    if (checkOut) {
      const loc = locations[checkOut.locationRef];
      dayTitle = `Departure from ${loc?.name || checkOut.name}`;
      isTravelDay = true;
      currentAccommodation = null; // Clear state *after* processing this day
    }
    if (cruiseDisembark) {
      const loc = locations[cruiseDisembark.arrivalPortRef];
      dayTitle = `Cruise Arrival: ${loc?.name || "Port"}`;
      isTravelDay = true;
      currentCruise = null; // Clear state *after* processing this day
    }

    // 2. Determine *current* state based on *previous* day's end state
    if (currentCruise) {
      // If we ended yesterday on a cruise...
      isCruiseDay = true;
      const portCall = dayItems.find(
        (item) => item.eventType === "cruise-port-call"
      );
      const seaDay = dayItems.find(
        (item) => item.eventType === "cruise-sea-day"
      );
      if (portCall) {
        const portLoc = locations[portCall.locationRef];
        dayTitle = `Port Call: ${portLoc?.name || "Unknown Port"}`;
      } else if (seaDay) {
        dayTitle = `At Sea (${currentCruise.shipName})`;
      } else {
        // Should be disembark day if neither port nor sea day, handled above
        dayTitle = `At Sea (${currentCruise.shipName})`; // Fallback
      }
      onCruise = currentCruise.shipName;
      stayingAt = null; // Cannot be in accommodation and on cruise
    } else if (currentAccommodation) {
      // If we ended yesterday in accommodation...
      const loc = locations[currentAccommodation.locationRef];
      dayTitle = loc?.name || currentAccommodation.name;
      stayingAt = currentAccommodation.name;
      onCruise = null;
    } else {
      // If not on cruise or in accommodation from yesterday, assume travel/transition
      stayingAt = null;
      onCruise = null;
      // Title might be set by check-in/flight later
    }

    // 3. Check for Check-in / Cruise Embark (Overrides title, sets state for *next* day)
    const checkIn = dayItems.find(
      (item) => item.eventType === "accommodation-check-in"
    );
    const cruiseEmbark = dayItems.find(
      (item) => item.eventType === "cruise-embark"
    );

    if (checkIn) {
      const loc = locations[checkIn.locationRef];
      dayTitle = `Arrival in ${loc?.name || checkIn.name}`;
      isTravelDay = true;
      // Find the actual accommodation object to set for the *next* day's check
      currentAccommodation =
        accommodations.find((a) => a.id === checkIn.id) || null;
      currentCruise = null; // Cannot check into hotel and be on cruise
      stayingAt = null; // Don't show "staying at" on check-in day itself
      onCruise = null;
    }
    if (cruiseEmbark) {
      const loc = locations[cruiseEmbark.departurePortRef];
      dayTitle = `Cruise Departure: ${loc?.name || "Port"}`;
      isTravelDay = true;
      isCruiseDay = true; // Mark as a cruise event day
      currentCruise = cruises.find((c) => c.id === cruiseEmbark.id) || null;
      currentAccommodation = null; // Assume check out before cruise
      stayingAt = null;
      onCruise = null; // Don't show "staying on" indicator on embark day itself
    }

    // 4. Check for Flights (Marks as travel day, potentially overrides title)
    const flight = dayItems.find((item) => item.eventType === "flight");
    if (flight) {
      isTravelDay = true;
      if (flight.details) {
        const parts = flight.details.split(" to ");
        dayTitle =
          parts.length === 2
            ? `Travel: ${parts[0]} → ${parts[1]}`
            : "Travel Day (Flight)";
      } else {
        dayTitle = "Travel Day (Flight)";
      }
      // If flying, clear accommodation/cruise status unless checking in/embarking same day
      if (!checkIn) currentAccommodation = null;
      if (!cruiseEmbark) currentCruise = null;
      stayingAt = null;
      onCruise = null;
    }

    // 5. Final title check if still default and not explicitly travel
    if (dayTitle === "Location Unknown" && !isTravelDay) {
      if (currentAccommodation) {
        // Should have been set earlier if staying
        const loc = locations[currentAccommodation.locationRef];
        dayTitle = loc?.name || currentAccommodation.name;
      } else if (currentCruise) {
        // Should have been set earlier if cruising
        dayTitle = `At Sea (${currentCruise.shipName})`; // Default if somehow missed
      } else {
        // Look for *any* activity location?
        const firstActivity = dayItems.find(
          (item) => item.locationRef && item.eventType === "activity"
        );
        if (firstActivity) {
          const loc = locations[firstActivity.locationRef];
          dayTitle = loc?.name || "Activity Location";
        } else {
          dayTitle = "Transition / Free Day"; // Better default
        }
      }
    } else if (dayTitle === "Location Unknown" && isTravelDay) {
      // If travel day and still unknown, likely just transit
      dayTitle = "Travel Day";
    }

    dailyInfoByDate[dateStr] = {
      title: dayTitle,
      stayingAt: stayingAt, // Where you are *staying* this night (determined by end of day state)
      onCruise: onCruise, // Which ship you are *on* this night (determined by end of day state)
    };

    // IMPORTANT: Update state *after* processing the day for the *next* iteration
    // If checking out today, clear accommodation for tomorrow's check
    if (checkOut) currentAccommodation = null;
    // If disembarking today, clear cruise for tomorrow's check
    if (cruiseDisembark) currentCruise = null;
    // If checking in today, set accommodation for tomorrow's check (already done above)
    // If embarking today, set cruise for tomorrow's check (already done above)
  }
  return dailyInfoByDate;
}

function structureDataForAlpine(
  startDate,
  endDate,
  weeks,
  itineraryByDate,
  dailyInfoByDate,
  locations
) {
  const processedWeeks = [];
  let currentWeek = null;
  let dayCounter = 0;

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    dayCounter++;
    const dateStr = formatDate(d);
    const dayName = getDayName(d);
    const items = itineraryByDate[dateStr] || [];
    const info = dailyInfoByDate[dateStr] || {
      title: "Error",
      stayingAt: null,
      onCruise: null,
    };

    // Find week for this day
    const weekData = weeks.find((w) => {
      const weekStart = parseDate(w.startDate);
      const weekEnd = parseDate(w.endDate);
      return weekStart && weekEnd && d >= weekStart && d <= weekEnd;
    });

    if (weekData && (!currentWeek || currentWeek.id !== weekData.id)) {
      // Start a new week
      currentWeek = {
        id: weekData.id,
        header: weekData.weekHeader,
        days: [],
      };
      processedWeeks.push(currentWeek);
    }

    if (currentWeek) {
      // Add day to the current week
      currentWeek.days.push({
        dateStr: dateStr,
        dayNumber: dayCounter,
        dayName: dayName,
        title: info.title,
        stayingAt: info.stayingAt,
        onCruise: info.onCruise,
        items: items.map((item) => ({
          // Process items slightly for easier display
          ...item,
          // Resolve location name if ref exists
          locationName: item.locationRef
            ? locations[item.locationRef]?.name || "Unknown Location"
            : item.name || null,
          // Use multiDayDescription if available, otherwise regular description
          displayDescription:
            item.multiDayDescription || item.description || "",
          // Format location details string
          formattedLocation: item.locationRef
            ? formatLocation(locations[item.locationRef])
            : item.location
            ? formatLocation(item.location)
            : null,
          // Simplify check for generic explore activity
          isGenericExplore:
            item.eventType === "activity" &&
            isGenericExploreActivity(item.description, info.title),
        })),
      });
    } else {
      console.warn("Day outside of any defined week:", dateStr);
      // Optionally handle days outside weeks, e.g., add to a default "Other" week
    }
  }
  return processedWeeks;
}

// --- Progress Calculation Utility ---
function calculateProgress(startDateUTC, endDateUTC, nowUTC) {
  if (!startDateUTC || !endDateUTC) return 0;
  const totalDuration = endDateUTC - startDateUTC;
  const elapsedDuration = nowUTC - startDateUTC;

  if (totalDuration <= 0) return 100; // Avoid division by zero or negative duration
  if (elapsedDuration <= 0) return 0; // Trip hasn't started
  if (elapsedDuration >= totalDuration) return 100; // Trip is over

  return Math.min(100, Math.max(0, (elapsedDuration / totalDuration) * 100));
}

function getProgressText(progress) {
  if (progress <= 0) return "Trip hasn't started yet!";
  if (progress >= 100) return "Trip complete!";
  return `Trip is ${progress.toFixed(0)}% complete.`;
}

// Note: No DOMContentLoaded listener needed anymore.
// Alpine will call loadTripData() via x-init.
