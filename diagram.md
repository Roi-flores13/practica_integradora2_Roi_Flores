# Flujos de Extensión de Reservaciones (Feature Extension)

Este documento describe las interacciones entre el **Usuario**, el cliente web (**Frontend**), el servidor Express (**Backend**) y la base de datos (**MongoDB / Persistencia**).

---

## 1. Happy Path: Extensión Exitosa (HTTP 200)

Flujo en el que la reservación existe, está `ACTIVE`, sigue vigente, el nuevo horario es posterior al actual, no existe colisión con otras reservas del mismo espacio y los cambios se persisten.

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant FE as Frontend (parking.js)
    participant BE as Backend (reservation.routes / service)
    participant DB as Persistencia (MongoDB)

    Usuario->>FE: Clic en botón "Extender" de la reservación
    FE-->>Usuario: Muestra formulario con hora sugerida (+1h)
    Usuario->>FE: Ingresa nueva hora fin válida y envía formulario
    FE->>BE: PATCH /api/reservations/:id/extend { endTime: "2026-10-13T13:00:00Z" }
    
    activate BE
    BE->>DB: Reservation.findById(id)
    DB-->>BE: Documento de reservación existente
    
    Note over BE: Valida estado === 'ACTIVE'<br/>Valida endTime > now (vigente)<br/>Valida newEnd > currentEnd
    
    BE->>DB: Reservation.find({ spotId, status: 'ACTIVE', _id != id, ... })
    DB-->>BE: [] (Sin conflictos con otras reservas)
    
    BE->>DB: reservation.save() (Actualiza endTime)
    DB-->>BE: Documento guardado con éxito
    BE-->>FE: HTTP 200 OK (Objeto reservación actualizado)
    deactivate BE

    activate FE
    FE->>BE: GET /api/reservations & GET /api/spots (Refresco concurrente)
    BE-->>FE: Listas actualizadas
    FE-->>Usuario: Renderiza nuevo horario y mensaje de éxito
    deactivate FE
```

---

## 2. Error Cases: Validación y Reglas de Negocio (HTTP 400, 404, 409)

Representación de los caminos de error estipulados por los lineamientos HTTP de la feature.

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant FE as Frontend (parking.js)
    participant BE as Backend (Express & Service)
    participant DB as Persistencia (MongoDB)

    alt Caso 400: Datos de Horario Inválidos
        Usuario->>FE: Ingresa hora anterior/igual o formato corrupto
        FE->>BE: PATCH /api/reservations/:id/extend { endTime: "hora-invalida" }
        activate BE
        BE->>DB: Reservation.findById(id)
        DB-->>BE: Reservación encontrada
        Note over BE: validateExtensionEndTime() retorna null
        BE-->>FE: HTTP 400 Bad Request { message: "New end time must be..." }
        deactivate BE
        FE-->>Usuario: Muestra alerta en formulario: "La nueva hora debe ser posterior..."

    else Caso 404: Reservación Inexistente o ID Inválido
        FE->>BE: PATCH /api/reservations/id_inexistente/extend { endTime: "..." }
        activate BE
        BE->>DB: Reservation.findById(id)
        DB-->>BE: null
        BE-->>FE: HTTP 404 Not Found { message: "Reservation not found" }
        deactivate BE
        FE-->>Usuario: Muestra error: "Reservación no encontrada."

    else Caso 409: Reservación Vencida, Cancelada o Conflicto
        Usuario->>FE: Solicita extender sobre horario ocupado por otro usuario
        FE->>BE: PATCH /api/reservations/:id/extend { endTime: "2026-10-13T14:00:00Z" }
        activate BE
        BE->>DB: Reservation.findById(id)
        DB-->>BE: Reservación activa
        BE->>DB: Reservation.find({ spotId, status: 'ACTIVE', _id != id, ... })
        DB-->>BE: [ { startTime: 12:30, endTime: 13:30 } ] (Traslape detectado)
        BE-->>FE: HTTP 409 Conflict { message: "Cannot extend... schedule conflict" }
        deactivate BE
        FE-->>Usuario: Muestra mensaje de conflicto sin modificar datos
    end
```

---

## 3. Edge Cases: Casos Límite y Adyacencia

Validación de condiciones de frontera:
1. **Adyacencia exacta**: La extensión finaliza justo cuando inicia la siguiente reserva activa (permitida).
2. **Exclusión de reservas canceladas**: Reservaciones `CANCELLED` no bloquean el rango extendido.
3. **No auto-conflicto**: El rango original de la misma reserva no compite contra su propia extensión.

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant BE as Backend (Service / Rules)
    participant DB as Persistencia (MongoDB)

    Note over FE,DB: Escenario 1: Adyacencia Exacta (newEnd == nextReservation.startTime)
    FE->>BE: PATCH /api/reservations/:id/extend { endTime: "12:00:00Z" }
    BE->>DB: Buscar conflictos activos excluyendo _id actual
    DB-->>BE: Siguiente reserva inicia a las 12:00:00Z exactas
    Note over BE: hasTimeConflict(currentEnd, newEnd, nextStart, nextEnd)<br/>Condición: (newStart < existingEnd && newEnd > existingStart)<br/>12:00 > 12:00 = FALSE (No hay conflicto)
    BE->>DB: Guarda reserva extendida
    DB-->>BE: OK
    BE-->>FE: HTTP 200 OK (Adyacencia permitida)

    Note over FE,DB: Escenario 2: Reservación CANCELLED en el mismo rango
    FE->>BE: PATCH /api/reservations/:id/extend { endTime: "14:00:00Z" }
    BE->>DB: Buscar colisiones con status: 'ACTIVE'
    DB-->>BE: Reservación previa en ese horario tiene status: 'CANCELLED' (filtrada en query)
    Note over BE: No cuenta como bloqueo
    BE->>DB: Guarda reserva extendida
    DB-->>BE: OK
    BE-->>FE: HTTP 200 OK (Extensión completada)

    Note over FE,DB: Escenario 3: Verificación de Vigencia en el Milisegundo Límite
    FE->>BE: Solicitud de extensión enviada
    Note over BE: Evalúa: reservation.endTime <= new Date()<br/>Si ya pasó por 1 milisegundo, rechaza con 409
    BE-->>FE: HTTP 409 Conflict ("Only active and unexpired reservations can be extended")
```